import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getMarketDataProvider, getFundamentalsProvider } from "@/services/market-data";
import { assetRepository } from "@/repositories/asset.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { assetDividendRepository } from "@/repositories/asset-dividend.repository";
import { alertService } from "@/services/alert.service";
import { dividendSyncService } from "@/services/dividend-sync.service";
import { fixedIncomeService } from "@/services/fixed-income.service";
import { syncHealthService } from "@/services/sync-health.service";
import { accountCleanupService } from "@/services/account-cleanup.service";
import type { AssetType } from "@prisma/client";

export interface SyncReport {
  requested: number;
  quotesUpdated: number;
  fundamentalsUpdated: number;
  assetsCreated: number;
  historyBackfilled: number;
  dividendsUpserted: number;
  /** Proventos com pagamento hoje que viraram recibo e notificação. */
  dividendsCredited: number;
  /** Títulos de renda fixa que tiveram o valor do dia recalculado. */
  fixedIncomeUpdated: number;
  failedTickers: string[];
  alertsTriggered: number;
}

interface SyncTarget {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  type: AssetType;
}

/**
 * Quantos ativos têm os fundamentos atualizados por ciclo.
 *
 * Com o padrão de 30 min entre ciclos, 4 por rodada dão ~192 requisições/dia — logo abaixo
 * das 200 do plano gratuito do provedor de fundamentos. Aumente junto com o plano.
 */
const FUNDAMENTALS_PER_CYCLE = Number(process.env.FUNDAMENTALS_PER_CYCLE ?? 4);

/**
 * Quantos ativos têm os proventos importados por ciclo, fora os que alguém acompanha.
 *
 * As fontes são gratuitas, então o limite aqui é educação com quem hospeda os dados: 10
 * por ciclo são 20 requisições a cada 30 min. Cobre o catálogo em algumas semanas e dá
 * Dividend Yield ao screener sem depender do provedor pago.
 */
const DIVIDENDS_PER_CYCLE = Number(process.env.DIVIDENDS_PER_CYCLE ?? 10);

/** Backfill de histórico quando o ativo tem menos de 2 candles nos últimos 7 dias. */
const HISTORY_STALE_DAYS = 7;
const HISTORY_MIN_RECENT = 2;

/** Remove chaves nulas/indefinidas: assim uma fonte não apaga o que a outra preencheu. */
function compact<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

/**
 * Busca e grava os fundamentos de um ativo. Devolve se algo foi gravado.
 * Compartilhado pelo sync normal e pela rotação que cobre o resto do mercado.
 */
async function fetchAndStoreFundamentals(asset: {
  id: string;
  ticker: string;
  type: AssetType;
}): Promise<boolean> {
  const provider = getFundamentalsProvider();
  if (!provider) return false;

  try {
    const data = await provider.getFundamentals(asset.ticker, asset.type === "FII");
    if (!data) return false;

    await assetFundamentalRepository.upsertSnapshot(
      asset.id,
      new Date(),
      compact({
        pl: data.pl,
        pvp: data.pvp,
        dividendYield: data.dividendYield,
        roe: data.roe,
        roic: data.roic,
        netMargin: data.netMargin,
        ebitdaMargin: data.ebitdaMargin,
        evEbit: data.evEbit,
        evEbitda: data.evEbitda,
        netDebt: data.netDebt,
        netDebtEbitda: data.netDebtEbitda,
        equity: data.equity,
        marketCap: data.marketCap,
        revenueGrowth: data.revenueGrowth,
        earningsGrowth: data.earningsGrowth,
        vacancy: data.vacancy,
        numberOfProperties: data.numberOfProperties,
        numberOfShareholders: data.numberOfShareholders,
        managerName: data.managerName,
      }),
    );

    // O segmento do FII vive no cadastro do ativo, não no snapshot.
    if (data.segment) {
      await prisma.asset.update({ where: { id: asset.id }, data: { segment: data.segment } });
    }

    return true;
  } catch (error) {
    logger.warn("Falha ao sincronizar fundamentos", {
      ticker: asset.ticker,
      error: (error as Error).message,
    });
    return false;
  }
}

export const marketSyncService = {
  /**
   * Espelha o catálogo do mercado no banco: cria os tickers que faltam e grava o
   * fechamento do dia de todos eles.
   *
   * É o que faz o screener varrer o mercado em vez da carteira do usuário. Tudo em
   * poucas queries — uma requisição ao provedor, um `createMany` de ativos, um de preços
   * e um de snapshots — porque são ~2000 ativos por ciclo.
   */
  async syncCatalog(): Promise<{ assetsCreated: number; pricesWritten: number }> {
    const market = getMarketDataProvider();
    const catalog = await market.listAll();
    if (catalog.length === 0) return { assetsCreated: 0, pricesWritten: 0 };

    const { count: assetsCreated } = await assetRepository.createManyFromCatalog(
      catalog.map((item) => ({
        ticker: item.ticker,
        name: item.name,
        type: item.assetType as AssetType,
        sector: item.sector,
        subsector: item.subsector,
      })),
    );

    const assets = await assetRepository.listByTickers(catalog.map((item) => item.ticker));
    const assetByTicker = new Map(assets.map((asset) => [asset.ticker, asset]));
    const now = new Date();

    const { count: pricesWritten } = await assetPriceRepository.createManyDaily(
      catalog.flatMap((item) => {
        const asset = assetByTicker.get(item.ticker);
        return asset ? [{ assetId: asset.id, close: item.price, volume: item.volume }] : [];
      }),
      now,
    );

    // Preço, valor de mercado e liquidez já vêm no catálogo: gravar aqui dá ao screener
    // as três colunas de graça, enquanto o resto dos indicadores espera a rotação.
    await assetFundamentalRepository.createManySnapshots(
      catalog.flatMap((item) => {
        const asset = assetByTicker.get(item.ticker);
        return asset
          ? [
              {
                assetId: asset.id,
                price: item.price,
                marketCap: item.marketCap,
                liquidity: item.volume,
              },
            ]
          : [];
      }),
      now,
    );

    // Cadastro incompleto (ativo criado antes só com o ticker) ganha nome e setor.
    for (const asset of assets) {
      const item = catalog.find((entry) => entry.ticker === asset.ticker);
      if (!item) continue;
      const needsName = asset.name === asset.ticker && item.name;
      const needsSector = !asset.sector && item.sector;
      if (needsName || needsSector) {
        await assetRepository.updateMeta(asset.id, {
          name: needsName ? item.name : undefined,
          sector: needsSector ? item.sector : undefined,
        });
      }
    }

    logger.info("Catálogo sincronizado", {
      catalog: catalog.length,
      assetsCreated,
      pricesWritten,
    });
    return { assetsCreated, pricesWritten };
  },

  /**
   * Atualiza os fundamentos de um punhado de ativos por ciclo, começando pelos mais
   * desatualizados.
   *
   * O provedor cobra por ticker (200/dia no plano gratuito), então varrer o mercado
   * inteiro de uma vez é impossível — a rotação cobre a base ao longo dos dias em vez de
   * gastar a cota sempre nos mesmos ativos.
   */
  async refreshStaleFundamentals(limit = FUNDAMENTALS_PER_CYCLE): Promise<number> {
    if (limit <= 0 || !getFundamentalsProvider()) return 0;

    try {
      // BDR fica de fora: o provedor não cobre nenhum deles, e são 675 ativos que só
      // consumiriam a cota diária sem devolver indicador nenhum.
      const assets = await assetRepository.listStaleFundamentals(limit, ["STOCK", "FII"]);
      let updated = 0;
      for (const asset of assets) {
        if (await fetchAndStoreFundamentals(asset)) updated++;
      }
      await assetRepository.markFundamentalsChecked(assets.map((asset) => asset.id));
      return updated;
    } catch (error) {
      logger.error("Falha na rotação de fundamentos", { error: (error as Error).message });
      return 0;
    }
  },

  /** Sincroniza todos os ativos ativos (uso do job agendado). */
  async syncAll(): Promise<SyncReport> {
    try {
      const report = await this.runFullSync();
      await syncHealthService.recordSuccess();
      return report;
    } catch (error) {
      // O vigia precisa saber da falha antes de ela subir para a rota: é a contagem de
      // falhas seguidas que dispara o aviso ao administrador.
      await syncHealthService.recordFailure((error as Error).message);
      throw error;
    }
  },

  async runFullSync(): Promise<SyncReport> {
    const catalog = await this.syncCatalog().catch((error) => {
      logger.error("Falha ao sincronizar catálogo", { error: (error as Error).message });
      return { assetsCreated: 0, pricesWritten: 0 };
    });

    // Só o que alguém acompanha entra no trabalho caro por ativo (fundamentos, proventos,
    // histórico). O mercado inteiro já foi coberto pelo catálogo, que é uma requisição só.
    const assets = await this.listTrackedAssets();
    const report = await this.syncAssets(assets);
    report.assetsCreated += catalog.assetsCreated;
    report.fundamentalsUpdated += await this.refreshStaleFundamentals();
    report.dividendsUpserted += await dividendSyncService.syncStale(DIVIDENDS_PER_CYCLE);

    // Renda fixa não tem cotação: o valor do dia sai da curva do indexador.
    try {
      report.fixedIncomeUpdated = await fixedIncomeService.syncPrices();
      await fixedIncomeService.notifyMaturities();
    } catch (error) {
      logger.error("Falha ao atualizar renda fixa", { error: (error as Error).message });
    }

    // Cadastros que não confirmaram o e-mail no prazo saem da base.
    try {
      await accountCleanupService.removeUnverified();
    } catch (error) {
      logger.error("Falha ao remover cadastros não confirmados", {
        error: (error as Error).message,
      });
    }

    return report;
  },

  /** Ativos que aparecem em carteira, watchlist, alerta ou meta de qualquer usuário. */
  async listTrackedAssets(): Promise<SyncTarget[]> {
    const [positions, watchlist, alerts, targets] = await Promise.all([
      prisma.position.findMany({ where: { quantity: { gt: 0 } }, select: { asset: true } }),
      prisma.watchlistItem.findMany({ select: { asset: true } }),
      prisma.alert.findMany({ select: { asset: true } }),
      prisma.allocationTarget.findMany({
        where: { assetId: { not: null } },
        select: { asset: true },
      }),
    ]);

    const byId = new Map<string, SyncTarget>();
    for (const list of [positions, watchlist, alerts, targets]) {
      for (const row of list) {
        if (!row.asset) continue;
        byId.set(row.asset.id, {
          id: row.asset.id,
          ticker: row.asset.ticker,
          name: row.asset.name,
          sector: row.asset.sector,
          type: row.asset.type,
        });
      }
    }

    return [...byId.values()];
  },

  /** Sincroniza os ativos relevantes para um usuário: carteira, watchlist, alertas e metas. */
  async syncForUser(userId: string): Promise<SyncReport> {
    const [positions, watchlist, alerts, targets] = await Promise.all([
      prisma.position.findMany({ where: { userId }, select: { asset: true } }),
      prisma.watchlistItem.findMany({ where: { watchlist: { userId } }, select: { asset: true } }),
      prisma.alert.findMany({ where: { userId }, select: { asset: true } }),
      prisma.allocationTarget.findMany({
        where: { userId, assetId: { not: null } },
        select: { asset: true },
      }),
    ]);

    const byId = new Map<string, SyncTarget>();
    for (const list of [positions, watchlist, alerts, targets]) {
      for (const row of list) {
        const asset = row.asset;
        if (asset) {
          byId.set(asset.id, {
            id: asset.id,
            ticker: asset.ticker,
            name: asset.name,
            sector: asset.sector,
            type: asset.type,
          });
        }
      }
    }

    return this.syncAssets([...byId.values()], userId);
  },

  async syncAssets(assets: SyncTarget[], userId?: string): Promise<SyncReport> {
    const report: SyncReport = {
      requested: assets.length,
      quotesUpdated: 0,
      fundamentalsUpdated: 0,
      assetsCreated: 0,
      historyBackfilled: 0,
      dividendsUpserted: 0,
      dividendsCredited: 0,
      fixedIncomeUpdated: 0,
      failedTickers: [],
      alertsTriggered: 0,
    };

    if (assets.length === 0) return report;

    // ------------------------------------------------------------
    // 1. Preços em massa — uma única requisição traz o mercado inteiro.
    // ------------------------------------------------------------
    const market = getMarketDataProvider();
    const catalog = await market.listAll();
    const catalogByTicker = new Map(catalog.map((item) => [item.ticker, item]));

    for (const asset of assets) {
      const item = catalogByTicker.get(asset.ticker);
      if (!item) {
        report.failedTickers.push(asset.ticker);
        continue;
      }

      try {
        const now = new Date();
        await assetPriceRepository.upsertDaily(asset.id, now, {
          close: item.price,
          volume: item.volume,
        });
        await assetFundamentalRepository.upsertSnapshot(
          asset.id,
          now,
          compact({ price: item.price, marketCap: item.marketCap, liquidity: item.volume }),
        );

        // Enriquece o cadastro quando ainda está incompleto (ativo criado só com o ticker).
        if ((asset.name === asset.ticker && item.name) || (!asset.sector && item.sector)) {
          await assetRepository.updateMeta(asset.id, {
            name: asset.name === asset.ticker ? item.name : undefined,
            sector: asset.sector ? undefined : item.sector,
          });
        }

        report.quotesUpdated++;
      } catch (error) {
        logger.error("Falha ao gravar cotação", {
          ticker: asset.ticker,
          error: (error as Error).message,
        });
        report.failedTickers.push(asset.ticker);
      }
    }

    // ------------------------------------------------------------
    // 2. Fundamentos — uma requisição por ativo, com cache de 12h.
    // ------------------------------------------------------------
    for (const asset of assets) {
      if (await fetchAndStoreFundamentals(asset)) report.fundamentalsUpdated++;
    }

    // ------------------------------------------------------------
    // 3. Proventos — B3 (anunciados) + Yahoo (histórico), fontes públicas.
    //
    // O provedor de cotações entra só como reforço: no plano gratuito ele não devolve
    // dividendo nenhum, e quando devolve já vem sem data de pagamento. Notificação de
    // declaração e crédito saem do dividendSyncService.
    // ------------------------------------------------------------
    try {
      const dividendReport = await dividendSyncService.syncAssets(
        assets.map((asset) => ({ id: asset.id, ticker: asset.ticker, type: asset.type })),
      );
      report.dividendsUpserted += dividendReport.created;
    } catch (error) {
      logger.warn("Falha ao sincronizar proventos", { error: (error as Error).message });
    }

    for (const asset of assets) {
      if (!catalogByTicker.has(asset.ticker)) continue;
      try {
        const dividends = await market.getDividends(asset.ticker);
        for (const dividend of dividends) {
          const { created } = await assetDividendRepository.upsertEvent(asset.id, dividend);
          if (created) report.dividendsUpserted++;
        }
      } catch (error) {
        logger.warn("Falha ao sincronizar dividendos do provedor de cotações", {
          ticker: asset.ticker,
          error: (error as Error).message,
        });
      }
    }

    // ------------------------------------------------------------
    // 4. Backfill de histórico de cotações.
    // ------------------------------------------------------------
    for (const asset of assets) {
      if (!catalogByTicker.has(asset.ticker)) continue;
      try {
        const recent = await assetPriceRepository.countRecent(asset.id, HISTORY_STALE_DAYS);
        if (recent >= HISTORY_MIN_RECENT) continue;

        const total = await prisma.assetPrice.count({ where: { assetId: asset.id } });
        const bars = await market.getHistory(asset.ticker, total === 0 ? "5y" : "3mo");
        if (bars.length > 0) {
          await assetPriceRepository.createManyHistory(asset.id, bars);
          report.historyBackfilled++;
        }
      } catch (error) {
        logger.warn("Falha no backfill de histórico", {
          ticker: asset.ticker,
          error: (error as Error).message,
        });
      }
    }

    // ------------------------------------------------------------
    // 5. Credita proventos cuja data de pagamento é hoje.
    // Idempotente: o recibo é único por usuário e provento, então rodar de novo no mesmo
    // dia não duplica notificação nem valor.
    // ------------------------------------------------------------
    try {
      report.dividendsCredited = await dividendSyncService.notifyPayments();
    } catch (error) {
      logger.error("Falha ao creditar proventos do dia", { error: (error as Error).message });
    }

    // ------------------------------------------------------------
    // 6. Reavalia alertas com os dados novos.
    // ------------------------------------------------------------
    try {
      report.alertsTriggered = await alertService.evaluate(userId);
    } catch (error) {
      logger.error("Falha ao avaliar alertas pós-sync", { error: (error as Error).message });
    }

    logger.info("Sincronização de mercado concluída", { ...report });
    return report;
  },
};

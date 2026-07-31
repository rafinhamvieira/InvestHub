import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getMarketDataProvider, getFundamentalsProvider } from "@/services/market-data";
import { assetRepository } from "@/repositories/asset.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { assetDividendRepository } from "@/repositories/asset-dividend.repository";
import { alertService } from "@/services/alert.service";
import type { AssetType } from "@prisma/client";

export interface SyncReport {
  requested: number;
  quotesUpdated: number;
  fundamentalsUpdated: number;
  assetsCreated: number;
  historyBackfilled: number;
  dividendsUpserted: number;
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

/** Backfill de histórico quando o ativo tem menos de 2 candles nos últimos 7 dias. */
const HISTORY_STALE_DAYS = 7;
const HISTORY_MIN_RECENT = 2;

/** Remove chaves nulas/indefinidas: assim uma fonte não apaga o que a outra preencheu. */
function compact<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

export const marketSyncService = {
  /** Sincroniza todos os ativos ativos (uso do job agendado). */
  async syncAll(): Promise<SyncReport> {
    const assets = await assetRepository.listActive();
    return this.syncAssets(assets);
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
    const fundamentals = getFundamentalsProvider();
    if (fundamentals) {
      for (const asset of assets) {
        try {
          const data = await fundamentals.getFundamentals(asset.ticker, asset.type === "FII");
          if (!data) continue;

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
            await prisma.asset.update({
              where: { id: asset.id },
              data: { segment: data.segment },
            });
          }

          report.fundamentalsUpdated++;
        } catch (error) {
          logger.warn("Falha ao sincronizar fundamentos", {
            ticker: asset.ticker,
            error: (error as Error).message,
          });
        }
      }
    }

    // ------------------------------------------------------------
    // 3. Dividendos (depende do plano do provedor de cotações).
    // ------------------------------------------------------------
    for (const asset of assets) {
      if (!catalogByTicker.has(asset.ticker)) continue;
      try {
        const dividends = await market.getDividends(asset.ticker);
        for (const dividend of dividends) {
          const { created } = await assetDividendRepository.upsertEvent(asset.id, dividend);
          if (created) report.dividendsUpserted++;
        }
      } catch (error) {
        logger.warn("Falha ao sincronizar dividendos", {
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
    // 5. Reavalia alertas com os dados novos.
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

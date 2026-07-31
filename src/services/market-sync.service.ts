import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getMarketDataProvider } from "@/services/market-data";
import { assetRepository } from "@/repositories/asset.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { assetDividendRepository } from "@/repositories/asset-dividend.repository";
import { alertService } from "@/services/alert.service";

export interface SyncReport {
  requested: number;
  quotesUpdated: number;
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
}

/** Backfill de histórico quando o ativo tem menos de 2 candles nos últimos 7 dias. */
const HISTORY_STALE_DAYS = 7;
const HISTORY_MIN_RECENT = 2;

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
        if (asset) byId.set(asset.id, { id: asset.id, ticker: asset.ticker, name: asset.name, sector: asset.sector });
      }
    }

    return this.syncAssets([...byId.values()], userId);
  },

  async syncAssets(assets: SyncTarget[], userId?: string): Promise<SyncReport> {
    const provider = getMarketDataProvider();
    const report: SyncReport = {
      requested: assets.length,
      quotesUpdated: 0,
      historyBackfilled: 0,
      dividendsUpserted: 0,
      failedTickers: [],
      alertsTriggered: 0,
    };

    if (assets.length === 0) return report;

    const assetByTicker = new Map(assets.map((a) => [a.ticker, a]));
    const quotes = await provider.getQuotes(assets.map((a) => a.ticker));

    for (const asset of assets) {
      const quote = quotes.get(asset.ticker);
      if (!quote) {
        report.failedTickers.push(asset.ticker);
        continue;
      }

      try {
        await assetPriceRepository.upsertDaily(asset.id, quote.date, {
          close: quote.price,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          volume: quote.volume,
        });

        await assetFundamentalRepository.upsertSnapshot(asset.id, quote.date, {
          price: quote.price,
          pl: quote.pl,
          dividendYield: quote.dividendYieldPercent,
          marketCap: quote.marketCap,
        });

        // Enriquece nome/setor quando o cadastro local é só o ticker.
        if ((asset.name === asset.ticker && quote.name) || (!asset.sector && quote.sector)) {
          await assetRepository.updateMeta(asset.id, {
            name: asset.name === asset.ticker ? quote.name : undefined,
            sector: asset.sector ? undefined : quote.sector,
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

    // ---------- Dividendos ----------
    for (const ticker of quotes.keys()) {
      const asset = assetByTicker.get(ticker);
      if (!asset) continue;
      try {
        const dividends = await provider.getDividends(ticker);
        for (const dividend of dividends) {
          const { created } = await assetDividendRepository.upsertEvent(asset.id, dividend);
          if (created) report.dividendsUpserted++;
        }
      } catch (error) {
        logger.warn("Falha ao sincronizar dividendos", {
          ticker,
          error: (error as Error).message,
        });
      }
    }

    // ---------- Backfill de histórico ----------
    for (const asset of assets) {
      if (!quotes.has(asset.ticker)) continue;
      try {
        const recent = await assetPriceRepository.countRecent(asset.id, HISTORY_STALE_DAYS);
        if (recent >= HISTORY_MIN_RECENT) continue;

        const total = await prisma.assetPrice.count({ where: { assetId: asset.id } });
        const range = total === 0 ? "5y" : "3mo";
        const bars = await provider.getHistory(asset.ticker, range);
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

    // ---------- Reavalia alertas com os dados novos ----------
    try {
      report.alertsTriggered = await alertService.evaluate(userId);
    } catch (error) {
      logger.error("Falha ao avaliar alertas pós-sync", { error: (error as Error).message });
    }

    logger.info("Sincronização de mercado concluída", { ...report });
    return report;
  },
};

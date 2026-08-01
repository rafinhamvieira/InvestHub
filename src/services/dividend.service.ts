import { assetDividendRepository } from "@/repositories/asset-dividend.repository";
import { transactionRepository } from "@/repositories/transaction.repository";
import { positionRepository } from "@/repositories/position.repository";
import {
  buildDividendRows,
  computeTotals,
  filterByPeriod,
  groupByAsset,
  groupByMonth,
  groupByYear,
} from "@/utils/dividend-math";
import type { LedgerEntry } from "@/utils/portfolio-math";
import type { DividendEvent, DividendOverview } from "@/types/dividends";

/** Janelas oferecidas na tela. `null` = desde o início. */
export type DividendPeriod = "12m" | "24m" | "60m" | "all";

const PERIOD_MONTHS: Record<DividendPeriod, number | null> = {
  "12m": 12,
  "24m": 24,
  "60m": 60,
  all: null,
};

export const dividendService = {
  /**
   * Extrato de proventos do usuário.
   *
   * O universo são os ativos que ele **já teve** — não só os atuais. Quem vendeu PETR4 no
   * ano passado continua tendo recebido aqueles proventos, e sumir com eles faria o total
   * histórico encolher a cada venda.
   */
  async getOverview(userId: string, period: DividendPeriod = "12m"): Promise<DividendOverview> {
    const [transactions, positions] = await Promise.all([
      transactionRepository.findAllByUser(userId),
      positionRepository.findAllByUserWithAsset(userId),
    ]);

    const ledger: LedgerEntry[] = transactions.map((transaction) => ({
      assetId: transaction.assetId,
      type: transaction.type,
      quantity: Number(transaction.quantity),
      price: Number(transaction.price),
      fees: Number(transaction.fees),
      date: transaction.date,
    }));

    const assetIds = [...new Set(transactions.map((transaction) => transaction.assetId))];
    if (assetIds.length === 0) {
      return {
        totals: { last12m: 0, last24m: 0, last60m: 0, allTime: 0 },
        monthlyAverage12m: 0,
        yieldOnCost12m: null,
        received: [],
        upcoming: [],
        byMonth: [],
        byYear: [],
        byAsset: [],
        lastSyncAt: null,
      };
    }

    const [dividends, lastSyncAt] = await Promise.all([
      assetDividendRepository.findWithAssetByAssetIds(assetIds),
      assetDividendRepository.lastImportedAt(assetIds),
    ]);

    const events: DividendEvent[] = dividends.map((dividend) => ({
      id: dividend.id,
      assetId: dividend.assetId,
      ticker: dividend.asset.ticker,
      name: dividend.asset.name,
      type: dividend.type,
      valuePerShare: Number(dividend.valuePerShare),
      exDate: dividend.exDate.toISOString(),
      paymentDate: dividend.paymentDate?.toISOString() ?? null,
      declaredAt: dividend.declaredAt?.toISOString() ?? null,
    }));

    const { received, upcoming } = buildDividendRows(events, ledger);

    const months = PERIOD_MONTHS[period];
    const inPeriod = filterByPeriod(received, months);

    const costByAsset = new Map(
      positions.map((position) => [position.assetId, Number(position.totalInvested)]),
    );
    const investedTotal = positions.reduce(
      (sum, position) => sum + Number(position.totalInvested),
      0,
    );

    const totals = computeTotals(received);
    // 24 meses de série cabem no gráfico sem virar poeira; períodos maiores viram anos.
    const chartMonths = months === null || months > 24 ? 24 : months;

    return {
      totals,
      monthlyAverage12m: totals.last12m / 12,
      yieldOnCost12m: investedTotal > 0 ? totals.last12m / investedTotal : null,
      received: inPeriod,
      upcoming,
      byMonth: groupByMonth(received, chartMonths),
      byYear: groupByYear(received),
      byAsset: groupByAsset(inPeriod, costByAsset),
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
    };
  },
};

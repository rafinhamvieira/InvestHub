import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { transactionRepository } from "@/repositories/transaction.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { assetDividendRepository } from "@/repositories/asset-dividend.repository";
import {
  computePositions,
  computePositionsAt,
  quantityAt,
  lastMonthEnds,
  type LedgerEntry,
} from "@/utils/portfolio-math";
import type { AssetType } from "@prisma/client";
import type { DashboardData, AllocationSlice } from "@/types/dashboard";

const EVOLUTION_MONTHS = 24;
const DIVIDEND_CHART_MONTHS = 12;

const TYPE_LABELS: Record<AssetType, string> = {
  STOCK: "Ações",
  FII: "FIIs",
  ETF: "ETFs",
  BDR: "BDRs",
  TREASURY: "Tesouro",
};

interface AssetMeta {
  ticker: string;
  type: AssetType;
  sector: string | null;
}

function monthLabel(date: Date): string {
  return format(date, "MMM/yy", { locale: ptBR });
}

function toSlices(totals: Map<string, number>, grandTotal: number): AllocationSlice[] {
  return [...totals.entries()]
    .map(([label, value]) => ({
      label,
      value,
      percent: grandTotal > 0 ? value / grandTotal : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export const dashboardService = {
  async getDashboard(userId: string): Promise<DashboardData> {
    const transactions = await transactionRepository.findAllByUser(userId);

    const empty: DashboardData = {
      hasData: false,
      summary: {
        totalValue: 0,
        totalInvested: 0,
        profit: 0,
        profitPercent: 0,
        dividendsAccumulated: 0,
        dividendsUpcoming: 0,
        portfolioYield12m: 0,
      },
      evolution: [],
      dividendsByMonth: [],
      bySector: [],
      byType: [],
    };

    if (transactions.length === 0) return empty;

    const ledger: LedgerEntry[] = transactions.map((t) => ({
      assetId: t.assetId,
      type: t.type,
      quantity: Number(t.quantity),
      price: Number(t.price),
      fees: Number(t.fees),
      date: t.date,
    }));

    const assetMeta = new Map<string, AssetMeta>(
      transactions.map((t) => [
        t.assetId,
        { ticker: t.asset.ticker, type: t.asset.type, sector: t.asset.sector },
      ]),
    );
    const assetIds = [...assetMeta.keys()];

    const [latestPrices, priceHistory, dividends] = await Promise.all([
      assetPriceRepository.findLatestByAssetIds(assetIds),
      assetPriceRepository.findHistoryByAssetIds(
        assetIds,
        lastMonthEnds(EVOLUTION_MONTHS)[0] ?? new Date(),
      ),
      assetDividendRepository.findByAssetIds(assetIds),
    ]);

    const latestPriceMap = new Map(latestPrices.map((p) => [p.assetId, Number(p.close)]));

    // ---------- Posições e sumário ----------
    const positions = computePositions(ledger);
    const openPositions = [...positions.values()].filter((p) => p.quantity > 0);

    let totalValue = 0;
    let totalInvested = 0;
    const sectorTotals = new Map<string, number>();
    const typeTotals = new Map<string, number>();

    for (const position of openPositions) {
      const price = latestPriceMap.get(position.assetId) ?? position.averagePrice;
      const value = position.quantity * price;
      totalValue += value;
      totalInvested += position.totalInvested;

      const meta = assetMeta.get(position.assetId);
      const sector = meta?.sector ?? "Outros";
      const typeLabel = meta ? TYPE_LABELS[meta.type] : "Outros";
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + value);
      typeTotals.set(typeLabel, (typeTotals.get(typeLabel) ?? 0) + value);
    }

    // ---------- Dividendos ----------
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    let dividendsAccumulated = 0;
    let dividendsUpcoming = 0;
    let dividends12m = 0;
    const dividendMonthTotals = new Map<string, number>();
    const dividendMonths = lastMonthEnds(DIVIDEND_CHART_MONTHS);
    for (const monthEnd of dividendMonths) dividendMonthTotals.set(monthLabel(monthEnd), 0);

    for (const dividend of dividends) {
      const valuePerShare = Number(dividend.valuePerShare);

      if (dividend.exDate <= now) {
        const qty = quantityAt(ledger, dividend.assetId, dividend.exDate);
        if (qty <= 0) continue;
        const total = qty * valuePerShare;

        const paymentDate = dividend.paymentDate ?? dividend.exDate;
        if (paymentDate <= now) {
          dividendsAccumulated += total;
          if (paymentDate >= twelveMonthsAgo) dividends12m += total;
          const label = monthLabel(paymentDate);
          if (dividendMonthTotals.has(label)) {
            dividendMonthTotals.set(label, (dividendMonthTotals.get(label) ?? 0) + total);
          }
        } else {
          dividendsUpcoming += total;
        }
      } else {
        // Data ex futura: estimativa com a posição atual.
        const qty = positions.get(dividend.assetId)?.quantity ?? 0;
        if (qty > 0) dividendsUpcoming += qty * valuePerShare;
      }
    }

    // ---------- Evolução mensal ----------
    // Preço por (assetId, mês): última cotação conhecida até o fim do mês; fallback preço médio.
    const historyByAsset = new Map<string, { date: Date; close: number }[]>();
    for (const row of priceHistory) {
      const list = historyByAsset.get(row.assetId) ?? [];
      list.push({ date: row.date, close: Number(row.close) });
      historyByAsset.set(row.assetId, list);
    }

    const firstTransactionDate = ledger[0]?.date ?? now;
    const evolution = lastMonthEnds(EVOLUTION_MONTHS)
      .filter((monthEnd) => monthEnd >= firstTransactionDate)
      .map((monthEnd) => {
        const monthPositions = computePositionsAt(ledger, monthEnd);
        let invested = 0;
        let value = 0;
        for (const position of monthPositions.values()) {
          if (position.quantity <= 0) continue;
          invested += position.totalInvested;
          const history = historyByAsset.get(position.assetId) ?? [];
          let price = position.averagePrice;
          for (const point of history) {
            if (point.date <= monthEnd) price = point.close;
            else break;
          }
          value += position.quantity * price;
        }
        return { month: monthLabel(monthEnd), invested, value };
      });

    const profit = totalValue - totalInvested;

    return {
      hasData: openPositions.length > 0 || dividendsAccumulated > 0,
      summary: {
        totalValue,
        totalInvested,
        profit,
        profitPercent: totalInvested > 0 ? profit / totalInvested : 0,
        dividendsAccumulated,
        dividendsUpcoming,
        portfolioYield12m: totalValue > 0 ? dividends12m / totalValue : 0,
      },
      evolution,
      dividendsByMonth: [...dividendMonthTotals.entries()].map(([month, total]) => ({
        month,
        total,
      })),
      bySector: toSlices(sectorTotals, totalValue),
      byType: toSlices(typeTotals, totalValue),
    };
  },
};

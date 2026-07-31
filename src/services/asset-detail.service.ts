import { assetRepository } from "@/repositories/asset.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { assetDividendRepository } from "@/repositories/asset-dividend.repository";
import { watchlistRepository } from "@/repositories/watchlist.repository";
import { transactionRepository } from "@/repositories/transaction.repository";
import { computePositions, type LedgerEntry } from "@/utils/portfolio-math";
import { valuationService, ValuationError } from "@/services/valuation.service";
import { scoreService } from "@/services/score.service";
import type {
  AssetDetail,
  DividendYearPoint,
  HistorySeries,
  IndicatorGroup,
  OhlcPoint,
  UserPositionSummary,
} from "@/types/asset-detail";
import type { AssetFundamental } from "@prisma/client";

export { ValuationError };

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildIndicatorGroups(f: AssetFundamental | null, isFii: boolean): IndicatorGroup[] {
  if (!f) return [];

  if (isFii) {
    return [
      {
        title: "Valuation e renda",
        items: [
          { label: "Dividend Yield", value: num(f.dividendYield), format: "percent" },
          { label: "P/VP", value: num(f.pvp), format: "number" },
          { label: "Cap Rate", value: num(f.capRate), format: "percent" },
        ],
      },
      {
        title: "Portfólio",
        items: [
          { label: "Vacância", value: num(f.vacancy), format: "percent" },
          { label: "Número de imóveis", value: f.numberOfProperties, format: "number" },
          { label: "Prazo médio (anos)", value: num(f.averageContractTerm), format: "number" },
          { label: "Indexador", value: f.indexer, format: "text" },
        ],
      },
      {
        title: "Fundo",
        items: [
          { label: "Gestora", value: f.managerName, format: "text" },
          { label: "Patrimônio", value: num(f.equity), format: "compact" },
          { label: "Cotistas", value: f.numberOfShareholders, format: "compact" },
          { label: "Liquidez diária", value: num(f.liquidity), format: "compact" },
        ],
      },
    ];
  }

  return [
    {
      title: "Valuation",
      items: [
        { label: "P/L", value: num(f.pl), format: "number" },
        { label: "P/VP", value: num(f.pvp), format: "number" },
        { label: "Dividend Yield", value: num(f.dividendYield), format: "percent" },
        { label: "EV/EBIT", value: num(f.evEbit), format: "number" },
        { label: "EV/EBITDA", value: num(f.evEbitda), format: "number" },
      ],
    },
    {
      title: "Rentabilidade e eficiência",
      items: [
        { label: "ROE", value: num(f.roe), format: "percent" },
        { label: "ROIC", value: num(f.roic), format: "percent" },
        { label: "Margem líquida", value: num(f.netMargin), format: "percent" },
        { label: "Margem EBITDA", value: num(f.ebitdaMargin), format: "percent" },
      ],
    },
    {
      title: "Crescimento",
      items: [
        { label: "Crescimento receita", value: num(f.revenueGrowth), format: "percent" },
        { label: "Crescimento lucro", value: num(f.earningsGrowth), format: "percent" },
      ],
    },
    {
      title: "Endividamento",
      items: [
        { label: "Dívida líquida", value: num(f.netDebt), format: "compact" },
        { label: "Dívida/EBITDA", value: num(f.netDebtEbitda), format: "number" },
      ],
    },
    {
      title: "Mercado e governança",
      items: [
        { label: "Valor de mercado", value: num(f.marketCap), format: "compact" },
        { label: "Patrimônio líquido", value: num(f.equity), format: "compact" },
        { label: "Liquidez diária", value: num(f.liquidity), format: "compact" },
        { label: "Tag Along", value: num(f.tagAlong), format: "percent" },
        { label: "Free Float", value: num(f.freeFloat), format: "percent" },
      ],
    },
  ];
}

export const assetDetailService = {
  async getDetail(userId: string, ticker: string): Promise<AssetDetail | null> {
    const asset = await assetRepository.findByTicker(ticker.toUpperCase());
    if (!asset) return null;

    const [
      ohlcRows,
      fundamentals,
      historyRows,
      dividendRows,
      favorites,
      transactions,
      valuation,
      score,
    ] = await Promise.all([
      assetPriceRepository.findOhlcByAsset(asset.id),
      assetFundamentalRepository.findLatestByAssetIds([asset.id]),
      assetFundamentalRepository.findHistoryByAsset(asset.id),
      assetDividendRepository.findByAsset(asset.id),
      watchlistRepository.listAssetIds(userId),
      transactionRepository.findAllByUserAndAsset(userId, asset.id),
      valuationService.getValuation(userId, ticker),
      scoreService.scoreAsset(userId, asset.id),
    ]);

    const fundamental = fundamentals[0] ?? null;

    // ---------- OHLC ----------
    const ohlc: OhlcPoint[] = ohlcRows.map((row) => {
      const close = Number(row.close);
      return {
        time: isoDay(row.date),
        open: row.open !== null ? Number(row.open) : close,
        high: row.high !== null ? Number(row.high) : close,
        low: row.low !== null ? Number(row.low) : close,
        close,
        volume: row.volume !== null ? Number(row.volume) : null,
      };
    });

    const lastClose = ohlc.at(-1)?.close ?? num(fundamental?.price);
    const previousClose = ohlc.at(-2)?.close ?? null;
    const dayChange =
      lastClose !== null && previousClose !== null && previousClose > 0
        ? (lastClose - previousClose) / previousClose
        : null;

    // ---------- Posição do usuário ----------
    let position: UserPositionSummary | null = null;
    if (transactions.length > 0) {
      const ledger: LedgerEntry[] = transactions.map((t) => ({
        assetId: asset.id,
        type: t.type,
        quantity: Number(t.quantity),
        price: Number(t.price),
        fees: Number(t.fees),
        date: t.date,
      }));
      const computed = computePositions(ledger).get(asset.id);
      if (computed && computed.quantity > 0) {
        const currentPrice = lastClose ?? computed.averagePrice;
        const currentValue = computed.quantity * currentPrice;
        const profit = currentValue - computed.totalInvested;
        position = {
          quantity: computed.quantity,
          averagePrice: computed.averagePrice,
          totalInvested: computed.totalInvested,
          currentValue,
          profit,
          profitPercent: computed.totalInvested > 0 ? profit / computed.totalInvested : 0,
        };
      }
    }

    // ---------- Dividendos ----------
    const dividends = dividendRows.map((d) => ({
      id: d.id,
      type: d.type,
      valuePerShare: Number(d.valuePerShare),
      exDate: d.exDate.toISOString(),
      paymentDate: d.paymentDate?.toISOString() ?? null,
    }));

    const yearTotals = new Map<string, number>();
    for (const d of dividendRows) {
      const year = String(d.exDate.getFullYear());
      yearTotals.set(year, (yearTotals.get(year) ?? 0) + Number(d.valuePerShare));
    }
    const dividendsByYear: DividendYearPoint[] = [...yearTotals.entries()]
      .map(([year, total]) => ({ year, total }))
      .sort((a, b) => a.year.localeCompare(b.year));

    // ---------- Séries históricas ----------
    const seriesDefs: Array<{ key: HistorySeries["key"]; label: string; format: HistorySeries["format"]; pick: (r: (typeof historyRows)[number]) => number | null }> = [
      { key: "dy", label: "Dividend Yield", format: "percent", pick: (r) => num(r.dividendYield) },
      { key: "pl", label: "P/L", format: "number", pick: (r) => num(r.pl) },
      { key: "pvp", label: "P/VP", format: "number", pick: (r) => num(r.pvp) },
      { key: "roe", label: "ROE", format: "percent", pick: (r) => num(r.roe) },
    ];

    const historySeries: HistorySeries[] = seriesDefs.map((def) => ({
      key: def.key,
      label: def.label,
      format: def.format,
      points: historyRows
        .map((row) => {
          const value = def.pick(row);
          return value !== null ? { date: isoDay(row.referenceDate), value } : null;
        })
        .filter((p): p is { date: string; value: number } => p !== null),
    }));

    return {
      assetId: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      type: asset.type,
      sector: asset.sector,
      description: asset.description,
      favorite: favorites.has(asset.id),
      price: lastClose,
      dayChange,
      ohlc,
      indicatorGroups: buildIndicatorGroups(fundamental, asset.type === "FII"),
      dividends,
      dividendsByYear,
      historySeries,
      position,
      valuation,
      score,
    };
  },
};

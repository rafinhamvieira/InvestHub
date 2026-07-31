import { assetRepository } from "@/repositories/asset.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { valuationAssumptionRepository } from "@/repositories/valuation-assumption.repository";
import { screenerRepository } from "@/repositories/screener.repository";
import {
  grahamFairPrice,
  bazinCeilingPrice,
  lynchFairPrice,
  dcfFairPrice,
  earningsYield,
  lpaFromPl,
  vpaFromPvp,
  safetyMargin,
} from "@/utils/valuation-math";
import { VALUATION_DEFAULTS } from "@/constants/valuation";
import type { AssumptionInput } from "@/schemas/valuation.schema";
import type {
  MethodResult,
  MethodVerdict,
  ValuationSummary,
  GreenblattResult,
} from "@/types/valuation";
import type { ValuationAssumption } from "@prisma/client";

export class ValuationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ValuationError";
  }
}

function pickAssumption(
  assumptions: ValuationAssumption[],
  method: string,
  assetId: string,
): ValuationAssumption | undefined {
  // Específica do ativo tem prioridade sobre a global.
  return (
    assumptions.find((a) => a.method === method && a.assetId === assetId) ??
    assumptions.find((a) => a.method === method && a.assetId === null)
  );
}

function frac(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n / 100 : null;
}

function verdictFor(
  price: number | null,
  fairPrice: number | null,
  desiredMargin: number,
): MethodVerdict {
  if (price === null || fairPrice === null || fairPrice <= 0) return "NO_DATA";
  const margin = (fairPrice - price) / fairPrice;
  if (margin >= desiredMargin) return "BUY";
  if (margin > 0) return "WAIT";
  return "OVERVALUED";
}

function pct(fraction: number): string {
  return `${(fraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export const valuationService = {
  async getValuation(userId: string, ticker: string): Promise<ValuationSummary> {
    const asset = await assetRepository.findByTicker(ticker.toUpperCase());
    if (!asset) throw new ValuationError("NOT_FOUND", "Ativo não encontrado.");

    const [fundamentals, prices, assumptions] = await Promise.all([
      assetFundamentalRepository.findLatestByAssetIds([asset.id]),
      assetPriceRepository.findLatestByAssetIds([asset.id]),
      valuationAssumptionRepository.findForUserAndAsset(userId, asset.id),
    ]);

    const fundamental = fundamentals[0] ?? null;
    const price =
      prices[0] !== undefined
        ? Number(prices[0].close)
        : fundamental?.price !== null && fundamental?.price !== undefined
          ? Number(fundamental.price)
          : null;

    const pl = fundamental?.pl !== null && fundamental?.pl !== undefined ? Number(fundamental.pl) : null;
    const pvp =
      fundamental?.pvp !== null && fundamental?.pvp !== undefined ? Number(fundamental.pvp) : null;
    const dy = frac(fundamental?.dividendYield);
    const growth = frac(fundamental?.earningsGrowth);
    const roic = frac(fundamental?.roic);
    const evEbit =
      fundamental?.evEbit !== null && fundamental?.evEbit !== undefined
        ? Number(fundamental.evEbit)
        : null;

    const lpa = price !== null && pl !== null ? lpaFromPl(price, pl) : null;
    const vpa = price !== null && pvp !== null ? vpaFromPvp(price, pvp) : null;
    const annualDividendPerShare = price !== null && dy !== null ? price * dy : null;

    const customMargin = pickAssumption(assumptions, "CUSTOM", asset.id);
    const desiredMargin =
      frac(customMargin?.marginOfSafety) ?? VALUATION_DEFAULTS.desiredSafetyMargin;

    const methods: MethodResult[] = [];

    // ---------- Graham ----------
    {
      const a = pickAssumption(assumptions, "GRAHAM", asset.id);
      const multiplier =
        a?.grahamMultiplier !== null && a?.grahamMultiplier !== undefined
          ? Number(a.grahamMultiplier)
          : VALUATION_DEFAULTS.grahamMultiplier;
      const fair = lpa !== null && vpa !== null ? grahamFairPrice(lpa, vpa, multiplier) : null;
      methods.push({
        method: "GRAHAM",
        label: "Benjamin Graham",
        fairPrice: fair,
        ceilingPrice: fair !== null ? fair * (1 - desiredMargin) : null,
        margin: price !== null && fair !== null ? safetyMargin(price, fair) : null,
        verdict: verdictFor(price, fair, desiredMargin),
        assumptions: `Multiplicador ${multiplier}`,
      });
    }

    // ---------- Bazin ----------
    {
      const a = pickAssumption(assumptions, "BAZIN", asset.id);
      const minYield = frac(a?.desiredDividendYield) ?? VALUATION_DEFAULTS.bazinMinYield;
      const ceiling =
        annualDividendPerShare !== null ? bazinCeilingPrice(annualDividendPerShare, minYield) : null;
      methods.push({
        method: "BAZIN",
        label: "Décio Bazin",
        fairPrice: ceiling,
        ceilingPrice: ceiling,
        margin: price !== null && ceiling !== null ? safetyMargin(price, ceiling) : null,
        verdict: verdictFor(price, ceiling, 0), // Bazin: teto já é o limite de compra
        assumptions: `DY mínimo ${pct(minYield)}`,
      });
    }

    // ---------- Lynch ----------
    {
      const a = pickAssumption(assumptions, "LYNCH", asset.id);
      const g = frac(a?.growthRate) ?? growth;
      const fair = lpa !== null && g !== null ? lynchFairPrice(lpa, g) : null;
      methods.push({
        method: "LYNCH",
        label: "Peter Lynch",
        fairPrice: fair,
        ceilingPrice: fair !== null ? fair * (1 - desiredMargin) : null,
        margin: price !== null && fair !== null ? safetyMargin(price, fair) : null,
        verdict: verdictFor(price, fair, desiredMargin),
        assumptions: g !== null ? `Crescimento ${pct(g)} (PEG = 1)` : "Sem taxa de crescimento",
      });
    }

    // ---------- DCF ----------
    {
      const a = pickAssumption(assumptions, "DCF", asset.id);
      const g = frac(a?.growthRate) ?? VALUATION_DEFAULTS.dcfGrowthRate;
      const r = frac(a?.discountRate) ?? VALUATION_DEFAULTS.dcfDiscountRate;
      const gp = frac(a?.perpetuityGrowthRate) ?? VALUATION_DEFAULTS.dcfPerpetuityGrowthRate;
      const years = a?.projectionYears ?? VALUATION_DEFAULTS.dcfProjectionYears;
      const fair =
        lpa !== null
          ? dcfFairPrice({
              baseCashflow: lpa,
              growthRate: g,
              discountRate: r,
              perpetuityGrowthRate: gp,
              projectionYears: years,
            })
          : null;
      methods.push({
        method: "DCF",
        label: "Fluxo de Caixa Descontado",
        fairPrice: fair,
        ceilingPrice: fair !== null ? fair * (1 - desiredMargin) : null,
        margin: price !== null && fair !== null ? safetyMargin(price, fair) : null,
        verdict: verdictFor(price, fair, desiredMargin),
        assumptions: `g ${pct(g)} · r ${pct(r)} · perpet. ${pct(gp)} · ${years} anos`,
      });
    }

    // ---------- Teto personalizado ----------
    {
      const fairs = methods.map((m) => m.fairPrice).filter((f): f is number => f !== null && f > 0);
      const minFair = fairs.length > 0 ? Math.min(...fairs) : null;
      const ceiling = minFair !== null ? minFair * (1 - desiredMargin) : null;
      methods.push({
        method: "CUSTOM",
        label: "Teto personalizado",
        fairPrice: minFair,
        ceilingPrice: ceiling,
        margin: price !== null && ceiling !== null ? safetyMargin(price, ceiling) : null,
        verdict: verdictFor(price, ceiling, 0),
        assumptions: `Menor preço justo − margem de ${pct(desiredMargin)}`,
      });
    }

    // ---------- Greenblatt (ranking no universo de ações) ----------
    const greenblatt = await this.buildGreenblattRank(asset.id, evEbit, roic);

    const margins = methods
      .filter((m) => m.method !== "CUSTOM")
      .map((m) => m.margin)
      .filter((m): m is number => m !== null);
    const averageMargin =
      margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : null;

    let overallVerdict: MethodVerdict = "NO_DATA";
    if (averageMargin !== null) {
      if (averageMargin >= desiredMargin) overallVerdict = "BUY";
      else if (averageMargin > 0) overallVerdict = "WAIT";
      else overallVerdict = "OVERVALUED";
    }

    return {
      ticker: asset.ticker,
      name: asset.name,
      price,
      methods,
      greenblatt,
      averageMargin,
      overallVerdict,
      desiredMargin,
      hasFundamentals: fundamental !== null,
    };
  },

  /** Ranking Magic Formula: soma dos ranks de Earnings Yield e ROIC no universo de ações com dados. */
  async buildGreenblattRank(
    assetId: string,
    evEbit: number | null,
    roic: number | null,
  ): Promise<GreenblattResult> {
    const ey = evEbit !== null ? earningsYield(evEbit) : null;

    const stocks = await screenerRepository.findAssetsByTypes(["STOCK"]);
    const fundamentals = await assetFundamentalRepository.findLatestByAssetIds(
      stocks.map((s) => s.id),
    );

    const universe = fundamentals
      .map((f) => ({
        assetId: f.assetId,
        ey: f.evEbit !== null && Number(f.evEbit) > 0 ? 1 / Number(f.evEbit) : null,
        roic: f.roic !== null ? Number(f.roic) / 100 : null,
      }))
      .filter((u): u is { assetId: string; ey: number; roic: number } => u.ey !== null && u.roic !== null);

    if (universe.length === 0 || ey === null || roic === null) {
      return { earningsYield: ey, roic, rank: null, universeSize: universe.length };
    }

    const byEy = [...universe].sort((a, b) => b.ey - a.ey);
    const byRoic = [...universe].sort((a, b) => b.roic - a.roic);
    const eyRank = new Map(byEy.map((u, i) => [u.assetId, i + 1]));
    const roicRank = new Map(byRoic.map((u, i) => [u.assetId, i + 1]));

    const combined = universe
      .map((u) => ({
        assetId: u.assetId,
        score: (eyRank.get(u.assetId) ?? 0) + (roicRank.get(u.assetId) ?? 0),
      }))
      .sort((a, b) => a.score - b.score);

    const position = combined.findIndex((c) => c.assetId === assetId);

    return {
      earningsYield: ey,
      roic,
      rank: position >= 0 ? position + 1 : null,
      universeSize: universe.length,
    };
  },

  async saveAssumption(userId: string, input: AssumptionInput): Promise<void> {
    const asset = await assetRepository.findByTicker(input.ticker);
    if (!asset) throw new ValuationError("NOT_FOUND", "Ativo não encontrado.");

    await valuationAssumptionRepository.upsert(userId, asset.id, input.method, {
      desiredDividendYield: input.desiredDividendYield,
      marginOfSafety: input.marginOfSafety,
      growthRate: input.growthRate,
      discountRate: input.discountRate,
      perpetuityGrowthRate: input.perpetuityGrowthRate,
      projectionYears: input.projectionYears,
      grahamMultiplier: input.grahamMultiplier,
    });
  },
};

import { prisma } from "@/lib/prisma";
import { scoreWeightRepository } from "@/repositories/score-weight.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { computeAssetScore, DEFAULT_WEIGHTS, type ScoreInput } from "@/utils/score-engine";
import type { AssetScore, ScoreWeights } from "@/types/score";
import type { ScoreWeightsInput } from "@/schemas/score.schema";

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Quantos dos últimos 5 anos tiveram algum provento, por ativo. */
async function countDividendYears(assetIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (assetIds.length === 0) return result;

  const since = new Date();
  since.setFullYear(since.getFullYear() - 5);

  const dividends = await prisma.assetDividend.findMany({
    where: { assetId: { in: assetIds }, exDate: { gte: since } },
    select: { assetId: true, exDate: true },
  });

  const yearsByAsset = new Map<string, Set<number>>();
  for (const dividend of dividends) {
    const years = yearsByAsset.get(dividend.assetId) ?? new Set<number>();
    // Mesmo motivo do painel de proventos: a data-ex é um dia do calendário.
    years.add(dividend.exDate.getUTCFullYear());
    yearsByAsset.set(dividend.assetId, years);
  }

  for (const [assetId, years] of yearsByAsset) result.set(assetId, years.size);
  return result;
}

export const scoreService = {
  async getWeights(userId: string): Promise<ScoreWeights> {
    const saved = await scoreWeightRepository.findByUser(userId);
    if (!saved) return DEFAULT_WEIGHTS;

    return {
      valuation: saved.valuation,
      dividendYield: saved.dividendYield,
      pl: saved.pl,
      roe: saved.roe,
      margins: saved.margins,
      debt: saved.debt,
      priceSafetyMargin: saved.priceSafetyMargin,
      dividendHistory: saved.dividendHistory,
      liquidity: saved.liquidity,
      governance: saved.governance,
    };
  },

  async saveWeights(userId: string, weights: ScoreWeightsInput): Promise<void> {
    await scoreWeightRepository.upsert(userId, weights);
  },

  async resetWeights(userId: string): Promise<void> {
    await scoreWeightRepository.reset(userId);
  },

  /** Calcula o score de vários ativos de uma vez (screeners). */
  async scoreAssets(userId: string, assetIds: string[]): Promise<Map<string, AssetScore>> {
    const scores = new Map<string, AssetScore>();
    if (assetIds.length === 0) return scores;

    const [weights, fundamentals, prices, dividendYears] = await Promise.all([
      this.getWeights(userId),
      assetFundamentalRepository.findLatestByAssetIds(assetIds),
      assetPriceRepository.findLatestByAssetIds(assetIds),
      countDividendYears(assetIds),
    ]);

    const fundamentalMap = new Map(fundamentals.map((f) => [f.assetId, f]));
    const priceMap = new Map(prices.map((p) => [p.assetId, Number(p.close)]));

    for (const assetId of assetIds) {
      const f = fundamentalMap.get(assetId);
      const input: ScoreInput = {
        price: priceMap.get(assetId) ?? num(f?.price),
        pl: num(f?.pl),
        pvp: num(f?.pvp),
        dividendYield: num(f?.dividendYield),
        roe: num(f?.roe),
        netMargin: num(f?.netMargin),
        ebitdaMargin: num(f?.ebitdaMargin),
        netDebtEbitda: num(f?.netDebtEbitda),
        liquidity: num(f?.liquidity),
        tagAlong: num(f?.tagAlong),
        freeFloat: num(f?.freeFloat),
        dividendYears: dividendYears.get(assetId) ?? null,
      };
      scores.set(assetId, computeAssetScore(input, weights));
    }

    return scores;
  },

  async scoreAsset(userId: string, assetId: string): Promise<AssetScore> {
    const scores = await this.scoreAssets(userId, [assetId]);
    return scores.get(assetId)!;
  },
};

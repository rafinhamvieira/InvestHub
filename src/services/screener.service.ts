import { screenerRepository } from "@/repositories/screener.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { watchlistRepository } from "@/repositories/watchlist.repository";
import { scoreService } from "@/services/score.service";
import type { ScreenerRow } from "@/types/screener";
import type { AssetFundamental } from "@prisma/client";

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadBase(userId: string, types: Parameters<typeof screenerRepository.findAssetsByTypes>[0]) {
  const assets = await screenerRepository.findAssetsByTypes(types);
  const assetIds = assets.map((a) => a.id);

  const [fundamentals, prices, favorites, scores] = await Promise.all([
    assetFundamentalRepository.findLatestByAssetIds(assetIds),
    assetPriceRepository.findLatestByAssetIds(assetIds),
    watchlistRepository.listAssetIds(userId),
    scoreService.scoreAssets(userId, assetIds),
  ]);

  return {
    assets,
    fundamentalMap: new Map<string, AssetFundamental>(fundamentals.map((f) => [f.assetId, f])),
    priceMap: new Map(prices.map((p) => [p.assetId, Number(p.close)])),
    favorites,
    scores,
  };
}

export const screenerService = {
  async getStockScreener(userId: string): Promise<ScreenerRow[]> {
    const { assets, fundamentalMap, priceMap, favorites, scores } = await loadBase(userId, [
      "STOCK",
      "BDR",
    ]);

    return assets.map((asset) => {
      const f = fundamentalMap.get(asset.id);
      return {
        assetId: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        favorite: favorites.has(asset.id),
        score: scores.get(asset.id)?.score ?? null,
        sector: asset.sector,
        subsector: asset.subsector,
        price: priceMap.get(asset.id) ?? num(f?.price),
        pl: num(f?.pl),
        pvp: num(f?.pvp),
        dy: num(f?.dividendYield),
        roe: num(f?.roe),
        roic: num(f?.roic),
        netMargin: num(f?.netMargin),
        ebitdaMargin: num(f?.ebitdaMargin),
        evEbit: num(f?.evEbit),
        evEbitda: num(f?.evEbitda),
        liquidity: num(f?.liquidity),
        tagAlong: num(f?.tagAlong),
        freeFloat: num(f?.freeFloat),
        revenueGrowth: num(f?.revenueGrowth),
        earningsGrowth: num(f?.earningsGrowth),
        netDebt: num(f?.netDebt),
        netDebtEbitda: num(f?.netDebtEbitda),
        equity: num(f?.equity),
        marketCap: num(f?.marketCap),
      };
    });
  },

  async getFiiScreener(userId: string): Promise<ScreenerRow[]> {
    const { assets, fundamentalMap, priceMap, favorites, scores } = await loadBase(userId, ["FII"]);

    return assets.map((asset) => {
      const f = fundamentalMap.get(asset.id);
      return {
        assetId: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        favorite: favorites.has(asset.id),
        score: scores.get(asset.id)?.score ?? null,
        segment: asset.segment ?? asset.sector,
        price: priceMap.get(asset.id) ?? num(f?.price),
        dy: num(f?.dividendYield),
        pvp: num(f?.pvp),
        vacancy: num(f?.vacancy),
        liquidity: num(f?.liquidity),
        numberOfProperties: f?.numberOfProperties ?? null,
        managerName: f?.managerName ?? null,
        equity: num(f?.equity),
        capRate: num(f?.capRate),
        averageContractTerm: num(f?.averageContractTerm),
        numberOfShareholders: f?.numberOfShareholders ?? null,
        indexer: f?.indexer ?? null,
      };
    });
  },
};

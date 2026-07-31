import { watchlistRepository } from "@/repositories/watchlist.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import type { AssetType } from "@prisma/client";

export interface WatchlistRow {
  assetId: string;
  ticker: string;
  name: string;
  type: AssetType;
  sector: string | null;
  price: number | null;
  dy: number | null;
  pl: number | null;
  pvp: number | null;
  addedAt: string;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const watchlistService = {
  async getWatchlist(userId: string): Promise<WatchlistRow[]> {
    const items = await watchlistRepository.listItemsWithAsset(userId);
    const assetIds = items.map((i) => i.asset.id);

    const [prices, fundamentals] = await Promise.all([
      assetPriceRepository.findLatestByAssetIds(assetIds),
      assetFundamentalRepository.findLatestByAssetIds(assetIds),
    ]);
    const priceMap = new Map(prices.map((p) => [p.assetId, Number(p.close)]));
    const fundamentalMap = new Map(fundamentals.map((f) => [f.assetId, f]));

    return items.map((item) => {
      const f = fundamentalMap.get(item.asset.id);
      return {
        assetId: item.asset.id,
        ticker: item.asset.ticker,
        name: item.asset.name,
        type: item.asset.type,
        sector: item.asset.sector,
        price: priceMap.get(item.asset.id) ?? num(f?.price),
        dy: num(f?.dividendYield),
        pl: num(f?.pl),
        pvp: num(f?.pvp),
        addedAt: item.addedAt.toISOString(),
      };
    });
  },
};

import { allocationTargetRepository } from "@/repositories/allocation-target.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { assetFundamentalRepository } from "@/repositories/asset-fundamental.repository";
import { portfolioService } from "@/services/portfolio.service";
import { buildContributionPlan, type EngineAsset, type TargetSet } from "@/utils/contribution-engine";
import { grahamFairPrice, bazinCeilingPrice, lpaFromPl, vpaFromPvp } from "@/utils/valuation-math";
import { ASSET_CLASS_LABELS } from "@/constants/asset";
import type { ContributionRequest } from "@/schemas/allocation.schema";
import type { ContributionPlan } from "@/types/contribution";
import type { AssetType } from "@prisma/client";

export const contributionService = {
  async buildPlan(userId: string, request: ContributionRequest): Promise<ContributionPlan> {
    const [portfolio, targets] = await Promise.all([
      portfolioService.getPortfolio(userId),
      allocationTargetRepository.findAllByUser(userId),
    ]);

    // Universo: posições atuais + ativos com meta individual (mesmo sem posição).
    const universe = new Map<
      string,
      {
        assetId: string;
        ticker: string;
        name: string;
        type: AssetType;
        sector: string | null;
        price: number;
        currentValue: number;
      }
    >();

    for (const position of portfolio.positions) {
      universe.set(position.assetId, {
        assetId: position.assetId,
        ticker: position.ticker,
        name: position.name,
        type: position.assetType,
        sector: position.sector,
        price: position.currentPrice,
        currentValue: position.currentValue,
      });
    }

    for (const target of targets) {
      if (target.level !== "ASSET" || !target.asset) continue;
      if (universe.has(target.asset.id)) continue;
      universe.set(target.asset.id, {
        assetId: target.asset.id,
        ticker: target.asset.ticker,
        name: target.asset.name,
        type: target.asset.type,
        sector: target.asset.sector,
        price: 0, // resolvido abaixo pela última cotação
        currentValue: 0,
      });
    }

    const assetIds = [...universe.keys()];
    const [latestPrices, fundamentals] = await Promise.all([
      assetPriceRepository.findLatestByAssetIds(assetIds),
      assetFundamentalRepository.findLatestByAssetIds(assetIds),
    ]);

    const priceMap = new Map(latestPrices.map((p) => [p.assetId, Number(p.close)]));
    const fundamentalMap = new Map(fundamentals.map((f) => [f.assetId, f]));

    const engineAssets: EngineAsset[] = [...universe.values()].map((asset) => {
      const price = asset.price > 0 ? asset.price : (priceMap.get(asset.assetId) ?? 0);
      const fundamental = fundamentalMap.get(asset.assetId);

      let fairPrice: number | null = null;
      let ceilingPrice: number | null = null;
      let dividendYield: number | null = null;

      if (fundamental && price > 0) {
        const pl = fundamental.pl !== null ? Number(fundamental.pl) : null;
        const pvp = fundamental.pvp !== null ? Number(fundamental.pvp) : null;
        const dyPercent =
          fundamental.dividendYield !== null ? Number(fundamental.dividendYield) : null;

        const lpa = pl !== null ? lpaFromPl(price, pl) : null;
        const vpa = pvp !== null ? vpaFromPvp(price, pvp) : null;
        if (lpa !== null && vpa !== null) fairPrice = grahamFairPrice(lpa, vpa);

        if (dyPercent !== null) {
          dividendYield = dyPercent / 100;
          ceilingPrice = bazinCeilingPrice(dividendYield * price);
        }
      }

      return {
        assetId: asset.assetId,
        ticker: asset.ticker,
        name: asset.name,
        assetClass: asset.type,
        classLabel: ASSET_CLASS_LABELS[asset.type],
        sector: asset.sector,
        price,
        currentValue: asset.currentValue,
        fairPrice,
        ceilingPrice,
        dividendYield,
      };
    });

    const targetSet: TargetSet = {
      byAsset: new Map(),
      byClass: new Map(),
      bySector: new Map(),
    };

    const tickerToAssetId = new Map(engineAssets.map((a) => [a.ticker, a.assetId]));
    for (const target of targets) {
      const fraction = Number(target.targetPercent) / 100;
      if (target.level === "CLASS") targetSet.byClass.set(target.label, fraction);
      else if (target.level === "SECTOR") targetSet.bySector.set(target.label, fraction);
      else {
        const assetId = target.asset?.id ?? tickerToAssetId.get(target.label);
        if (assetId) targetSet.byAsset.set(assetId, fraction);
      }
    }

    return buildContributionPlan(engineAssets, targetSet, request.amount, request.strategy, {
      maxPerAssetFraction: request.maxPerAsset / 100,
    });
  },
};

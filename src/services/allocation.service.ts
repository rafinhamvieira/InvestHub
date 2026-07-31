import { allocationTargetRepository } from "@/repositories/allocation-target.repository";
import { assetRepository } from "@/repositories/asset.repository";
import { portfolioService } from "@/services/portfolio.service";
import { ASSET_CLASS_LABELS } from "@/constants/asset";
import type { AllocationTargetInput } from "@/schemas/allocation.schema";
import type { AllocationOverview, AllocationRow } from "@/types/allocation";
import type { AllocationTargetLevel, AssetType } from "@prisma/client";

export class AllocationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AllocationError";
  }
}

interface GroupAggregate {
  label: string;
  displayLabel: string;
  value: number;
}

function buildRows(
  level: AllocationTargetLevel,
  groups: Map<string, GroupAggregate>,
  targets: Map<string, { id: string; percent: number }>,
  totalValue: number,
): AllocationRow[] {
  const labels = new Set([...groups.keys(), ...targets.keys()]);

  const rows: AllocationRow[] = [...labels].map((label) => {
    const group = groups.get(label);
    const target = targets.get(label);
    const currentValue = group?.value ?? 0;
    const currentPercent = totalValue > 0 ? currentValue / totalValue : 0;
    const targetPercent = target ? target.percent / 100 : null;

    return {
      id: target?.id ?? null,
      level,
      label,
      displayLabel: group?.displayLabel ?? label,
      currentPercent,
      targetPercent,
      diff: targetPercent !== null ? targetPercent - currentPercent : null,
      valueToTarget: targetPercent !== null ? targetPercent * totalValue - currentValue : null,
      currentValue,
    };
  });

  return rows.sort(
    (a, b) => (b.targetPercent ?? b.currentPercent) - (a.targetPercent ?? a.currentPercent),
  );
}

export const allocationService = {
  async getOverview(userId: string): Promise<AllocationOverview> {
    const [portfolio, targets] = await Promise.all([
      portfolioService.getPortfolio(userId),
      allocationTargetRepository.findAllByUser(userId),
    ]);

    const totalValue = portfolio.totals.totalValue;

    const classGroups = new Map<string, GroupAggregate>();
    const sectorGroups = new Map<string, GroupAggregate>();
    const assetGroups = new Map<string, GroupAggregate>();

    for (const position of portfolio.positions) {
      const classKey = position.assetType;
      const classAgg = classGroups.get(classKey) ?? {
        label: classKey,
        displayLabel: ASSET_CLASS_LABELS[position.assetType],
        value: 0,
      };
      classAgg.value += position.currentValue;
      classGroups.set(classKey, classAgg);

      const sectorKey = position.sector ?? "Sem setor";
      const sectorAgg = sectorGroups.get(sectorKey) ?? {
        label: sectorKey,
        displayLabel: sectorKey,
        value: 0,
      };
      sectorAgg.value += position.currentValue;
      sectorGroups.set(sectorKey, sectorAgg);

      const assetAgg = assetGroups.get(position.ticker) ?? {
        label: position.ticker,
        displayLabel: position.ticker,
        value: 0,
      };
      assetAgg.value += position.currentValue;
      assetGroups.set(position.ticker, assetAgg);
    }

    const classTargets = new Map<string, { id: string; percent: number }>();
    const sectorTargets = new Map<string, { id: string; percent: number }>();
    const assetTargets = new Map<string, { id: string; percent: number }>();

    for (const target of targets) {
      const entry = { id: target.id, percent: Number(target.targetPercent) };
      if (target.level === "CLASS") classTargets.set(target.label, entry);
      else if (target.level === "SECTOR") sectorTargets.set(target.label, entry);
      else assetTargets.set(target.label, entry);
    }

    // Rótulos amigáveis para classes com meta mas sem posição.
    const byClass = buildRows("CLASS", classGroups, classTargets, totalValue).map((row) => ({
      ...row,
      displayLabel: ASSET_CLASS_LABELS[row.label as AssetType] ?? row.displayLabel,
    }));

    const sum = (map: Map<string, { percent: number }>) =>
      [...map.values()].reduce((s, t) => s + t.percent, 0);

    return {
      totalValue,
      byClass,
      bySector: buildRows("SECTOR", sectorGroups, sectorTargets, totalValue),
      byAsset: buildRows("ASSET", assetGroups, assetTargets, totalValue),
      sums: {
        CLASS: sum(classTargets),
        SECTOR: sum(sectorTargets),
        ASSET: sum(assetTargets),
      },
    };
  },

  async saveTarget(userId: string, input: AllocationTargetInput): Promise<void> {
    let assetId: string | null = null;

    if (input.level === "ASSET") {
      const asset = await assetRepository.findOrCreate(
        input.label,
        (input.assetType ?? "STOCK") as AssetType,
      );
      assetId = asset.id;
    }

    await allocationTargetRepository.upsert(
      userId,
      input.level,
      input.label,
      input.targetPercent,
      assetId,
    );
  },

  async deleteTarget(userId: string, targetId: string): Promise<void> {
    const existing = await allocationTargetRepository.findByIdAndUser(targetId, userId);
    if (!existing) throw new AllocationError("NOT_FOUND", "Meta não encontrada.");
    await allocationTargetRepository.delete(targetId);
  },
};

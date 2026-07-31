import type { AllocationTargetLevel } from "@prisma/client";

export interface AllocationRow {
  id: string | null;
  level: AllocationTargetLevel;
  /** Rótulo técnico (AssetType, setor ou ticker). */
  label: string;
  /** Rótulo de exibição (ex: "Ações" para STOCK). */
  displayLabel: string;
  /** Fração atual do patrimônio. */
  currentPercent: number;
  /** Fração alvo; null = grupo sem meta definida. */
  targetPercent: number | null;
  /** target - current (fração). Positivo = abaixo da meta. */
  diff: number | null;
  /** Valor em R$ para atingir a meta (negativo = acima da meta). */
  valueToTarget: number | null;
  currentValue: number;
}

export interface AllocationOverview {
  totalValue: number;
  byClass: AllocationRow[];
  bySector: AllocationRow[];
  byAsset: AllocationRow[];
  /** Soma das metas por nível (para alertar quando ≠ 100%). */
  sums: { CLASS: number; SECTOR: number; ASSET: number };
}

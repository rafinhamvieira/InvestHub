import type { AssetType } from "@prisma/client";

export const ASSET_CLASS_LABELS: Record<AssetType, string> = {
  STOCK: "Ações",
  FII: "FIIs",
  ETF: "ETFs",
  BDR: "BDRs",
  TREASURY: "Tesouro Direto",
  FIXED_INCOME: "Renda Fixa",
};

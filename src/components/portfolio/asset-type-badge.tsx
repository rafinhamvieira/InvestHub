import { Badge } from "@/components/ui/badge";
import type { AssetType } from "@prisma/client";

const TYPE_CONFIG: Record<AssetType, { label: string }> = {
  STOCK: { label: "Ação" },
  FII: { label: "FII" },
  ETF: { label: "ETF" },
  BDR: { label: "BDR" },
  TREASURY: { label: "Tesouro" },
};

export function AssetTypeBadge({ type }: { type: AssetType }) {
  return <Badge variant="secondary">{TYPE_CONFIG[type].label}</Badge>;
}

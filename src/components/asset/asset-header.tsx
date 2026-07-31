"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { formatCurrency, formatSignedPercent } from "@/utils/format";
import { AssetTypeBadge } from "@/components/portfolio/asset-type-badge";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/shared/score-badge";
import { cn } from "@/lib/utils";
import type { AssetDetail } from "@/types/asset-detail";

interface AssetHeaderProps {
  detail: Pick<
    AssetDetail,
    "assetId" | "ticker" | "name" | "type" | "sector" | "price" | "dayChange" | "favorite"
  > & { score: number | null };
}

export function AssetHeader({ detail }: AssetHeaderProps) {
  const [favorite, setFavorite] = useState(detail.favorite);

  async function toggleFavorite() {
    setFavorite((v) => !v);
    const response = await fetch("/api/watchlist/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: detail.assetId }),
    });
    if (!response.ok) {
      setFavorite(detail.favorite);
      toast.error("Não foi possível atualizar o favorito.");
    }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{detail.ticker}</h1>
          <button
            onClick={toggleFavorite}
            aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            className="text-muted-foreground transition-colors hover:text-warning"
          >
            <Star className={cn("size-5", favorite && "fill-warning text-warning")} />
          </button>
          <AssetTypeBadge type={detail.type} />
          {detail.sector && <Badge variant="outline">{detail.sector}</Badge>}
          <ScoreBadge score={detail.score} showLabel />
        </div>
        <p className="text-sm text-muted-foreground">{detail.name}</p>
      </div>

      <div className="text-right">
        <p className="text-3xl font-semibold tabular-nums">
          {detail.price !== null ? formatCurrency(detail.price) : "—"}
        </p>
        {detail.dayChange !== null && (
          <p
            className={cn(
              "text-sm font-medium tabular-nums",
              detail.dayChange >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {formatSignedPercent(detail.dayChange)} no dia
          </p>
        )}
      </div>
    </div>
  );
}

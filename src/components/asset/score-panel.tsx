"use client";

import { Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScoreBadge, RATING_LABELS } from "@/components/shared/score-badge";
import { ScoreWeightsDialog } from "@/components/shared/score-weights-dialog";
import { cn } from "@/lib/utils";
import type { AssetScore } from "@/types/score";

function barTone(score: number): string {
  if (score >= 70) return "bg-success";
  if (score >= 40) return "bg-warning";
  return "bg-destructive";
}

export function ScorePanel({ score }: { score: AssetScore }) {
  const evaluated = score.breakdown.filter((c) => c.weight > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Nota do ativo</CardTitle>
            <CardDescription>
              Média ponderada dos critérios com dados disponíveis, segundo os seus pesos.
            </CardDescription>
          </div>
          <ScoreWeightsDialog />
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-5xl font-semibold tabular-nums",
                score.score !== null && score.score >= 70 && "text-success",
                score.score !== null && score.score < 40 && "text-destructive",
              )}
            >
              {score.score ?? "—"}
            </span>
            <span className="text-lg text-muted-foreground">/ 100</span>
          </div>
          <div className="space-y-1">
            <ScoreBadge score={score.score} showLabel />
            <p className="text-xs text-muted-foreground">
              {RATING_LABELS[score.rating]} · {score.coverage}% dos critérios avaliados
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como a nota foi formada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {evaluated.map((criterion) => (
            <div key={criterion.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium">{criterion.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  peso {criterion.weight} ·{" "}
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      criterion.score === null && "text-muted-foreground",
                    )}
                  >
                    {criterion.score ?? "sem dados"}
                  </span>
                </span>
              </div>
              <Progress
                value={criterion.score ?? 0}
                className="h-1.5"
                indicatorClassName={
                  criterion.score === null ? "bg-muted-foreground/30" : barTone(criterion.score)
                }
              />
              <p className="flex items-start gap-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" />
                {criterion.explanation}
              </p>
            </div>
          ))}

          {evaluated.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todos os critérios estão com peso zero. Ajuste os pesos para calcular a nota.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

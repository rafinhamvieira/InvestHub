import { cn } from "@/lib/utils";
import { ratingFor } from "@/utils/score-engine";
import type { ScoreRating } from "@/types/score";

const RATING_CLASSES: Record<ScoreRating, string> = {
  EXCELLENT: "bg-success/15 text-success",
  GOOD: "bg-primary/15 text-primary",
  FAIR: "bg-warning/20 text-warning-foreground dark:text-warning",
  WEAK: "bg-destructive/15 text-destructive",
  NO_DATA: "bg-muted text-muted-foreground",
};

export const RATING_LABELS: Record<ScoreRating, string> = {
  EXCELLENT: "Excelente",
  GOOD: "Bom",
  FAIR: "Regular",
  WEAK: "Fraco",
  NO_DATA: "Sem dados",
};

interface ScoreBadgeProps {
  score: number | null;
  className?: string;
  showLabel?: boolean;
}

export function ScoreBadge({ score, className, showLabel = false }: ScoreBadgeProps) {
  const rating = ratingFor(score);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
        RATING_CLASSES[rating],
        className,
      )}
    >
      {score ?? "—"}
      {showLabel && <span className="text-xs font-medium">{RATING_LABELS[rating]}</span>}
    </span>
  );
}

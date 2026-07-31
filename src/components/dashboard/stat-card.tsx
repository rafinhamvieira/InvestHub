import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  /** Texto secundário opcional (ex: variação percentual). */
  hint?: string;
  /** Cor semântica do valor: positivo (verde), negativo (vermelho) ou neutro. */
  tone?: "positive" | "negative" | "neutral";
}

export function StatCard({ title, value, icon: Icon, hint, tone = "neutral" }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p
            className={cn(
              "text-2xl font-semibold tracking-tight",
              tone === "positive" && "text-success",
              tone === "negative" && "text-destructive",
            )}
          >
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

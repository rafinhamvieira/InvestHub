"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, SlidersVertical } from "lucide-react";
import { CRITERION_LABELS, DEFAULT_WEIGHTS } from "@/utils/score-engine";
import type { ScoreCriterionKey, ScoreWeights } from "@/types/score";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CRITERION_KEYS = Object.keys(DEFAULT_WEIGHTS) as ScoreCriterionKey[];

/** Editor dos pesos do Score Inteligente. Os pesos valem para toda a conta. */
export function ScoreWeightsDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    fetch("/api/score/weights")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.weights) setWeights(data.weights);
      })
      .catch(() => null)
      .finally(() => setIsLoading(false));
  }, [open]);

  const total = CRITERION_KEYS.reduce((sum, key) => sum + (weights[key] || 0), 0);

  async function save() {
    setIsSaving(true);
    const response = await fetch("/api/score/weights", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(weights),
    });
    setIsSaving(false);

    if (!response.ok) {
      toast.error("Não foi possível salvar os pesos.");
      return;
    }

    toast.success("Pesos atualizados. As notas foram recalculadas.");
    setOpen(false);
    router.refresh();
  }

  async function resetToDefaults() {
    setWeights(DEFAULT_WEIGHTS);
    await fetch("/api/score/weights", { method: "DELETE" }).catch(() => null);
    toast.success("Pesos restaurados para o padrão.");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersVertical />
          Pesos da nota
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pesos do Score Inteligente</DialogTitle>
          <DialogDescription>
            Defina quanto cada critério influencia a nota de 0 a 100. Critérios sem dados no ativo
            são ignorados e os demais pesos se redistribuem.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {CRITERION_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-3">
                <Label htmlFor={`weight-${key}`} className="flex-1 font-normal">
                  {CRITERION_LABELS[key]}
                </Label>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={weights[key]}
                  onChange={(e) =>
                    setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                  className="h-1.5 w-32 cursor-pointer accent-primary"
                  aria-label={`Peso de ${CRITERION_LABELS[key]}`}
                />
                <Input
                  id={`weight-${key}`}
                  inputMode="numeric"
                  value={weights[key]}
                  onChange={(e) =>
                    setWeights((prev) => ({
                      ...prev,
                      [key]: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                    }))
                  }
                  className="h-8 w-14 text-center"
                />
              </div>
            ))}

            <p
              className={cn(
                "pt-2 text-sm",
                total === 100 ? "text-muted-foreground" : "text-warning-foreground dark:text-warning",
              )}
            >
              Soma dos pesos: <span className="font-medium tabular-nums">{total}</span>
              {total !== 100 && " — não precisa somar 100, os pesos são relativos entre si."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={resetToDefaults}>
            <RotateCcw />
            Restaurar padrão
          </Button>
          <Button onClick={save} disabled={isSaving || total === 0}>
            {isSaving && <Loader2 className="animate-spin" />}
            Salvar pesos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

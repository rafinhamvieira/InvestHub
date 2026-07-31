"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ASSET_CLASS_LABELS } from "@/constants/asset";
import type { AllocationRow } from "@/types/allocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Level = "CLASS" | "SECTOR" | "ASSET";

interface TargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: Level;
  /** Linha em edição (define rótulo + percentual inicial); null = nova meta. */
  row: AllocationRow | null;
  /** Sugestões de rótulo (setores existentes / tickers da carteira). */
  suggestions: string[];
}

const LEVEL_TITLES: Record<Level, string> = {
  CLASS: "Meta por classe",
  SECTOR: "Meta por setor",
  ASSET: "Meta por ativo",
};

export function TargetDialog({ open, onOpenChange, level, row, suggestions }: TargetDialogProps) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [percent, setPercent] = useState("");
  const [assetType, setAssetType] = useState("STOCK");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(row?.label ?? "");
      setPercent(row?.targetPercent !== null && row ? String(row.targetPercent * 100) : "");
      setAssetType("STOCK");
    }
  }, [open, row]);

  async function onSubmit() {
    setIsSubmitting(true);

    const response = await fetch("/api/allocation/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level,
        label,
        targetPercent: Number(percent.replace(",", ".")),
        ...(level === "ASSET" ? { assetType } : {}),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const firstIssue =
        data?.issues?.fieldErrors && (Object.values(data.issues.fieldErrors)[0] as string[])?.[0];
      toast.error(firstIssue ?? data?.message ?? "Não foi possível salvar a meta.");
      return;
    }

    toast.success("Meta salva.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{LEVEL_TITLES[level]}</DialogTitle>
          <DialogDescription>
            Defina o percentual alvo. A soma das metas do nível deve tender a 100%.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{level === "CLASS" ? "Classe" : level === "SECTOR" ? "Setor" : "Ticker"}</Label>
            {level === "CLASS" ? (
              <Select value={label} onValueChange={setLabel} disabled={row !== null}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a classe" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_CLASS_LABELS).map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  list={`${level}-suggestions`}
                  placeholder={level === "ASSET" ? "BBAS3" : "Energia"}
                  className={level === "ASSET" ? "uppercase" : undefined}
                  disabled={row !== null}
                />
                <datalist id={`${level}-suggestions`}>
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </>
            )}
          </div>

          {level === "ASSET" && row === null && (
            <div className="space-y-2">
              <Label>Tipo do ativo (se ainda não cadastrado)</Label>
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_CLASS_LABELS).map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="percent">Percentual alvo (%)</Label>
            <Input
              id="percent"
              inputMode="decimal"
              placeholder="15"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting || !label || !percent}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

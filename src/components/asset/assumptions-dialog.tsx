"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AssumptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
}

const METHOD_FIELDS: Record<string, { title: string; fields: FieldDef[] }> = {
  GRAHAM: {
    title: "Graham",
    fields: [{ key: "grahamMultiplier", label: "Multiplicador", placeholder: "22,5" }],
  },
  BAZIN: {
    title: "Bazin",
    fields: [{ key: "desiredDividendYield", label: "DY mínimo (%)", placeholder: "6" }],
  },
  LYNCH: {
    title: "Lynch",
    fields: [{ key: "growthRate", label: "Crescimento (%)", placeholder: "10" }],
  },
  DCF: {
    title: "DCF",
    fields: [
      { key: "growthRate", label: "Crescimento (%)", placeholder: "5" },
      { key: "discountRate", label: "Taxa de desconto (%)", placeholder: "12" },
      { key: "perpetuityGrowthRate", label: "Perpetuidade (%)", placeholder: "3" },
      { key: "projectionYears", label: "Anos de projeção", placeholder: "10" },
    ],
  },
  CUSTOM: {
    title: "Margem",
    fields: [{ key: "marginOfSafety", label: "Margem de segurança desejada (%)", placeholder: "20" }],
  },
};

export function AssumptionsDialog({ open, onOpenChange, ticker }: AssumptionsDialogProps) {
  const router = useRouter();
  const [method, setMethod] = useState("GRAHAM");
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function save() {
    setIsSubmitting(true);

    const config = METHOD_FIELDS[method]!;
    const payload: Record<string, unknown> = { ticker, method };
    for (const field of config.fields) {
      const raw = values[field.key];
      if (raw !== undefined && raw !== "") payload[field.key] = Number(raw.replace(",", "."));
    }

    const response = await fetch("/api/valuation/assumptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      toast.error("Não foi possível salvar as premissas.");
      return;
    }

    toast.success("Premissas salvas.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Premissas de valuation — {ticker}</DialogTitle>
          <DialogDescription>
            Campos vazios mantêm o padrão do sistema. Valores salvos valem só para este ativo.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={method} onValueChange={setMethod}>
          <TabsList className="grid w-full grid-cols-5">
            {Object.entries(METHOD_FIELDS).map(([key, config]) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {config.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.entries(METHOD_FIELDS).map(([key, config]) => (
            <TabsContent key={key} value={key} className="space-y-3">
              {config.fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    inputMode="decimal"
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { extractApiError } from "@/utils/api-error";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_OPTIONS = [
  { value: "PRICE_BELOW", label: "Preço abaixo de", needsValue: true, unit: "R$" },
  { value: "PRICE_ABOVE", label: "Preço acima de", needsValue: true, unit: "R$" },
  { value: "DIVIDEND_YIELD_ABOVE", label: "Dividend Yield acima de", needsValue: true, unit: "%" },
  { value: "PL_BELOW", label: "P/L abaixo de", needsValue: true, unit: "" },
  { value: "FAIR_PRICE_MARGIN_REACHED", label: "Margem de segurança atingir", needsValue: true, unit: "%" },
  { value: "NEW_DIVIDEND_DECLARED", label: "Novo provento declarado", needsValue: false, unit: "" },
] as const;

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-preenche o ticker (ex: quando aberto da tela do ativo). */
  defaultTicker?: string;
}

export function AlertDialog({ open, onOpenChange, defaultTicker = "" }: AlertDialogProps) {
  const router = useRouter();
  const [ticker, setTicker] = useState(defaultTicker);
  const [type, setType] = useState<string>("PRICE_BELOW");
  const [targetValue, setTargetValue] = useState("");
  const [channel, setChannel] = useState("IN_APP");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedType = TYPE_OPTIONS.find((t) => t.value === type)!;

  async function save() {
    setIsSubmitting(true);

    const response = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        type,
        targetValue: selectedType.needsValue ? Number(targetValue.replace(",", ".")) : 0,
        channel,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível criar o alerta. O ativo existe?"));
      return;
    }

    toast.success("Alerta criado.");
    setTicker("");
    setTargetValue("");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo alerta</DialogTitle>
          <DialogDescription>
            O alerta dispara uma única vez e pode ser reativado depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="alert-ticker">Ticker</Label>
            <Input
              id="alert-ticker"
              placeholder="PETR4"
              className="uppercase"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
            />
          </div>

          <div className="space-y-2">
            <Label>Condição</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedType.needsValue && (
            <div className="space-y-2">
              <Label htmlFor="alert-value">
                Valor alvo{selectedType.unit ? ` (${selectedType.unit})` : ""}
              </Label>
              <Input
                id="alert-value"
                inputMode="decimal"
                placeholder={selectedType.unit === "%" ? "8" : "30,00"}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Canal de notificação</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_APP">No aplicativo</SelectItem>
                <SelectItem value="EMAIL">E-mail + aplicativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={isSubmitting || !ticker || (selectedType.needsValue && !targetValue)}
          >
            {isSubmitting && <Loader2 className="animate-spin" />}
            Criar alerta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

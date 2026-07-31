"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { extractApiError } from "@/utils/api-error";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { transactionInputSchema } from "@/schemas/transaction.schema";
import type { TransactionDTO } from "@/types/portfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const ASSET_TYPE_OPTIONS = [
  { value: "STOCK", label: "Ação" },
  { value: "FII", label: "FII" },
  { value: "ETF", label: "ETF" },
  { value: "BDR", label: "BDR" },
  { value: "TREASURY", label: "Tesouro" },
] as const;

// Formulário trabalha com strings (inputs); coerção numérica/data fica no schema.
const formSchema = transactionInputSchema.extend({
  quantity: z.string().min(1, "Informe a quantidade."),
  price: z.string().min(1, "Informe o preço."),
  fees: z.string(),
  date: z.string().min(1, "Informe a data."),
});
type FormValues = z.infer<typeof formSchema>;

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Transação em edição; null = nova. */
  transaction: TransactionDTO | null;
  brokers: string[];
}

function toFormValues(transaction: TransactionDTO | null): FormValues {
  if (!transaction) {
    return {
      ticker: "",
      assetType: "STOCK",
      type: "BUY",
      quantity: "",
      price: "",
      fees: "0",
      date: new Date().toISOString().slice(0, 10),
      brokerName: "",
      notes: "",
    };
  }
  return {
    ticker: transaction.ticker,
    assetType: transaction.assetType,
    type: transaction.type,
    quantity: String(transaction.quantity),
    price: String(transaction.price),
    fees: String(transaction.fees),
    date: transaction.date.slice(0, 10),
    brokerName: transaction.brokerName ?? "",
    notes: transaction.notes ?? "",
  };
}

export function TransactionDialog({ open, onOpenChange, transaction, brokers }: TransactionDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = transaction !== null;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(transaction),
  });

  useEffect(() => {
    if (open) reset(toFormValues(transaction));
  }, [open, transaction, reset]);

  const operationType = watch("type");
  const assetType = watch("assetType");

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);

    const payload = {
      ...values,
      quantity: Number(values.quantity.replace(",", ".")),
      price: Number(values.price.replace(",", ".")),
      fees: Number(values.fees.replace(",", ".") || 0),
    };

    const response = await fetch(
      isEditing ? `/api/portfolio/transactions/${transaction.id}` : "/api/portfolio/transactions",
      {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    setIsSubmitting(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível salvar a transação."));
      return;
    }

    toast.success(isEditing ? "Transação atualizada." : "Transação registrada.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar transação" : "Nova transação"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Ajuste os dados da operação. A posição será recalculada."
              : "Registre uma compra ou venda. A posição é consolidada automaticamente."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Operação</Label>
              <Select
                value={operationType}
                onValueChange={(v) => setValue("type", v as FormValues["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Compra</SelectItem>
                  <SelectItem value="SELL">Venda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de ativo</Label>
              <Select
                value={assetType}
                onValueChange={(v) => setValue("assetType", v as FormValues["assetType"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticker">Ticker</Label>
              <Input
                id="ticker"
                placeholder="PETR4"
                className="uppercase"
                {...register("ticker")}
              />
              {errors.ticker && <p className="text-sm text-destructive">{errors.ticker.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input id="date" type="date" {...register("date")} />
              {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade</Label>
              <Input id="quantity" inputMode="decimal" placeholder="100" {...register("quantity")} />
              {errors.quantity && (
                <p className="text-sm text-destructive">{errors.quantity.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Preço unitário</Label>
              <Input id="price" inputMode="decimal" placeholder="32,50" {...register("price")} />
              {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fees">Taxas</Label>
              <Input id="fees" inputMode="decimal" placeholder="0,00" {...register("fees")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brokerName">Corretora (opcional)</Label>
            <Input id="brokerName" list="broker-options" placeholder="XP, Rico..." {...register("brokerName")} />
            <datalist id="broker-options">
              {brokers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea id="notes" rows={2} {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isEditing ? "Salvar alterações" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

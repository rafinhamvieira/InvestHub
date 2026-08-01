"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { extractApiError } from "@/utils/api-error";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { isFixedIncomeType } from "@/schemas/transaction.schema";
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
  { value: "TREASURY", label: "Tesouro Direto" },
  { value: "FIXED_INCOME", label: "Renda Fixa (CDB, LCI, LCA...)" },
] as const;

const INDEXER_OPTIONS = [
  { value: "CDI", label: "CDI", hint: "% do CDI (ex: 110)" },
  { value: "SELIC", label: "Selic", hint: "% da Selic (ex: 100)" },
  { value: "IPCA", label: "IPCA +", hint: "juro real anual (ex: 6)" },
  { value: "PREFIXADO", label: "Prefixado", hint: "taxa anual (ex: 12,5)" },
] as const;

/**
 * Formulário trabalha com strings (inputs); coerção fica no schema do servidor.
 *
 * Renda fixa e renda variável preenchem campos diferentes, então a validação de cada
 * bloco acontece no submit — o mesmo `superRefine` do servidor cobre o resto.
 */
const formSchema = z.object({
  ticker: z.string(),
  assetType: z.enum(["STOCK", "FII", "ETF", "BDR", "TREASURY", "FIXED_INCOME"]),
  type: z.enum(["BUY", "SELL"]),
  quantity: z.string(),
  price: z.string(),
  fees: z.string(),
  date: z.string().min(1, "Informe a data."),
  brokerName: z.string(),
  notes: z.string(),
  // Renda fixa
  name: z.string(),
  issuer: z.string(),
  indexer: z.enum(["CDI", "SELIC", "IPCA", "PREFIXADO"]),
  indexPercent: z.string(),
  spreadPercent: z.string(),
  amount: z.string(),
  maturityDate: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

function toNumber(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
}

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Transação em edição; null = nova. */
  transaction: TransactionDTO | null;
  brokers: string[];
}

const EMPTY_FIXED_INCOME = {
  name: "",
  issuer: "",
  indexer: "CDI" as const,
  indexPercent: "",
  spreadPercent: "",
  amount: "",
  maturityDate: "",
};

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
      ...EMPTY_FIXED_INCOME,
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
    ...EMPTY_FIXED_INCOME,
    ...(transaction.fixedIncome ?? {}),
    name: transaction.fixedIncome?.name ?? transaction.name ?? "",
    amount: transaction.fixedIncome ? String(transaction.quantity * transaction.price) : "",
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
  const indexer = watch("indexer");
  const isFixedIncome = isFixedIncomeType(assetType);
  const indexerOption = INDEXER_OPTIONS.find((option) => option.value === indexer);

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);

    const payload = isFixedIncome
      ? {
          assetType: values.assetType,
          type: values.type,
          fees: toNumber(values.fees) ?? 0,
          date: values.date,
          brokerName: values.brokerName,
          notes: values.notes,
          fixedIncome: {
            name: values.name,
            issuer: values.issuer,
            indexer: values.indexer,
            indexPercent: toNumber(values.indexPercent),
            spreadPercent: toNumber(values.spreadPercent),
            amount: toNumber(values.amount) ?? 0,
            maturityDate: values.maturityDate || null,
          },
        }
      : {
          ...values,
          quantity: toNumber(values.quantity) ?? 0,
          price: toNumber(values.price) ?? 0,
          fees: toNumber(values.fees) ?? 0,
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

          {isFixedIncome ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Título</Label>
                  <Input
                    id="name"
                    placeholder="CDB Banco Inter 2028"
                    {...register("name")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="issuer">Emissor</Label>
                  <Input
                    id="issuer"
                    placeholder={assetType === "TREASURY" ? "Tesouro Nacional" : "Banco Inter"}
                    {...register("issuer")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Indexador</Label>
                  <Select
                    value={indexer}
                    onValueChange={(v) => setValue("indexer", v as FormValues["indexer"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDEXER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {indexer === "CDI" || indexer === "SELIC" ? (
                  <div className="space-y-2">
                    <Label htmlFor="indexPercent">% do indexador</Label>
                    <Input
                      id="indexPercent"
                      inputMode="decimal"
                      placeholder="110"
                      {...register("indexPercent")}
                    />
                    <p className="text-xs text-muted-foreground">{indexerOption?.hint}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="spreadPercent">
                      {indexer === "IPCA" ? "Juro real (% a.a.)" : "Taxa (% a.a.)"}
                    </Label>
                    <Input
                      id="spreadPercent"
                      inputMode="decimal"
                      placeholder={indexer === "IPCA" ? "6" : "12,5"}
                      {...register("spreadPercent")}
                    />
                    <p className="text-xs text-muted-foreground">{indexerOption?.hint}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor aplicado</Label>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    placeholder="5000,00"
                    {...register("amount")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Data da aplicação</Label>
                  <Input id="date" type="date" {...register("date")} />
                  {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maturityDate">Vencimento</Label>
                  <Input id="maturityDate" type="date" {...register("maturityDate")} />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                O valor do título é corrigido automaticamente pela curva do indexador
                (Banco Central), sem precisar atualizar nada à mão.
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ticker">Ticker</Label>
                  <Input
                    id="ticker"
                    placeholder="PETR4"
                    className="uppercase"
                    {...register("ticker")}
                  />
                  {errors.ticker && (
                    <p className="text-sm text-destructive">{errors.ticker.message}</p>
                  )}
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
                  <Input
                    id="quantity"
                    inputMode="decimal"
                    placeholder="100"
                    {...register("quantity")}
                  />
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
            </>
          )}

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

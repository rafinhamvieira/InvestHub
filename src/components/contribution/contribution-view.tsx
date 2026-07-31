"use client";

import { useState } from "react";
import { toast } from "sonner";
import { extractApiError } from "@/utils/api-error";
import { Coins, Info, Loader2, Sparkles } from "lucide-react";
import { formatCurrency, formatPercent } from "@/utils/format";
import type { ContributionPlan, StrategyConfig } from "@/types/contribution";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STRATEGY_OPTIONS: Array<{ key: keyof StrategyConfig; label: string; description: string }> = [
  {
    key: "rebalance",
    label: "Rebalanceamento",
    description: "Aproximar a carteira das metas de alocação.",
  },
  {
    key: "belowFair",
    label: "Abaixo do preço justo",
    description: "Priorizar ativos negociados abaixo do justo (Graham).",
  },
  {
    key: "belowCeiling",
    label: "Abaixo do preço teto",
    description: "Priorizar ativos abaixo do teto (Bazin).",
  },
  {
    key: "safetyMargin",
    label: "Margem de segurança",
    description: "Priorizar maior distância entre preço e valor justo.",
  },
  {
    key: "dividendYield",
    label: "Dividend Yield",
    description: "Priorizar maiores pagadores de proventos.",
  },
];

function scoreTone(score: number): string {
  if (score >= 70) return "bg-success";
  if (score >= 40) return "bg-warning";
  return "bg-destructive";
}

export function ContributionView() {
  const [amount, setAmount] = useState("");
  const [strategy, setStrategy] = useState<StrategyConfig>({
    rebalance: true,
    belowFair: false,
    belowCeiling: false,
    safetyMargin: false,
    dividendYield: false,
  });
  const [plan, setPlan] = useState<ContributionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const anyEnabled = Object.values(strategy).some(Boolean);

  async function generatePlan() {
    setIsLoading(true);
    setPlan(null);

    const response = await fetch("/api/contribution/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount.replace(",", ".")), strategy }),
    });

    setIsLoading(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível gerar a recomendação."));
      return;
    }

    setPlan(await response.json());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recomendação de Aporte</h1>
        <p className="text-sm text-muted-foreground">
          Informe quanto vai investir e deixe o sistema montar a melhor distribuição.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo aporte</CardTitle>
          <CardDescription>
            O algoritmo compra quantidades inteiras, unidade a unidade, sempre do ativo que mais
            melhora a carteira segundo os critérios escolhidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex max-w-xs items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="amount">Valor do aporte (R$)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="1500,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <Button onClick={generatePlan} disabled={isLoading || !amount || !anyEnabled}>
              {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Recomendar
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STRATEGY_OPTIONS.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <Checkbox
                  checked={strategy[option.key]}
                  onCheckedChange={(checked) =>
                    setStrategy((prev) => ({ ...prev, [option.key]: checked === true }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
          {!anyEnabled && (
            <p className="text-xs text-destructive">Habilite ao menos um critério.</p>
          )}
        </CardContent>
      </Card>

      {plan && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Valor aportado</p>
                <p className="text-2xl font-semibold">{formatCurrency(plan.spent)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Saldo restante</p>
                <p className="text-2xl font-semibold">{formatCurrency(plan.leftover)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Patrimônio após aporte</p>
                <p className="text-2xl font-semibold">{formatCurrency(plan.totalAfter)}</p>
              </CardContent>
            </Card>
          </div>

          {plan.items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <Coins className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma compra recomendada — verifique se há cotações e metas cadastradas, ou se
                  o valor cobre ao menos 1 unidade de algum ativo.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Compras recomendadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-0 pb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ativo</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right">Investir</TableHead>
                      <TableHead className="text-right">% antes → depois</TableHead>
                      <TableHead className="w-40">Nota de oportunidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.items.map((item) => (
                      <TableRow key={item.assetId}>
                        <TableCell>
                          <span className="font-medium">{item.ticker}</span>
                          <ul className="mt-1 max-w-md space-y-0.5">
                            {item.reasons.map((reason) => (
                              <li
                                key={reason}
                                className="flex items-start gap-1 text-xs text-muted-foreground"
                              >
                                <Info className="mt-0.5 size-3 shrink-0" />
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.price)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(item.invested)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(item.weightBefore)} → {formatPercent(item.weightAfter)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={item.score}
                              className="h-1.5"
                              indicatorClassName={scoreTone(item.score)}
                            />
                            <span className="w-8 text-right text-sm font-medium tabular-nums">
                              {item.score}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {plan.byClassAfter.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Carteira após o aporte</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Classe</TableHead>
                      <TableHead className="text-right">Antes</TableHead>
                      <TableHead className="text-right">Depois</TableHead>
                      <TableHead className="text-right">Meta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.byClassAfter.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(row.before)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatPercent(row.after)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.target !== null ? formatPercent(row.target) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {plan.warnings.length > 0 && (
            <div className="space-y-1">
              {plan.warnings.map((warning) => (
                <Badge key={warning} variant="warning">
                  {warning}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { formatCurrency, formatSignedPercent } from "@/utils/format";
import type { MethodVerdict, ValuationSummary } from "@/types/valuation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssumptionsDialog } from "@/components/asset/assumptions-dialog";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const VERDICT_CONFIG: Record<MethodVerdict, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  BUY: { label: "Comprar", variant: "success" },
  WAIT: { label: "Aguardar", variant: "warning" },
  OVERVALUED: { label: "Sobrevalorizado", variant: "destructive" },
  NO_DATA: { label: "Sem dados", variant: "secondary" },
};

const OVERALL_LABEL: Record<MethodVerdict, string> = {
  BUY: "Subvalorizado — margem de segurança atingida",
  WAIT: "Subvalorizado — margem de segurança insuficiente",
  OVERVALUED: "Sobrevalorizado",
  NO_DATA: "Sem dados fundamentais para avaliar",
};

export function ValuationPanel({ summary }: { summary: ValuationSummary }) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const overall = VERDICT_CONFIG[summary.overallVerdict];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Preço atual</p>
            <p className="text-2xl font-semibold tabular-nums">
              {summary.price !== null ? formatCurrency(summary.price) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Margem média vs preço justo</p>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                summary.averageMargin !== null && summary.averageMargin > 0 && "text-success",
                summary.averageMargin !== null && summary.averageMargin < 0 && "text-destructive",
              )}
            >
              {summary.averageMargin !== null ? formatSignedPercent(summary.averageMargin) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col justify-center gap-1 p-5">
            <p className="text-sm text-muted-foreground">Veredito geral</p>
            <div>
              <Badge variant={overall.variant}>{OVERALL_LABEL[summary.overallVerdict]}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Métodos de valuation</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAssumptionsOpen(true)}>
            <Settings2 />
            Premissas
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Preço justo</TableHead>
                <TableHead className="text-right">Preço teto</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead>Veredito</TableHead>
                <TableHead>Premissas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.methods.map((method) => {
                const verdict = VERDICT_CONFIG[method.verdict];
                return (
                  <TableRow key={method.method}>
                    <TableCell className="font-medium">{method.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {method.fairPrice !== null ? formatCurrency(method.fairPrice) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {method.ceilingPrice !== null ? formatCurrency(method.ceilingPrice) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        method.margin !== null && method.margin > 0 && "text-success",
                        method.margin !== null && method.margin < 0 && "text-destructive",
                      )}
                    >
                      {method.margin !== null ? formatSignedPercent(method.margin) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={verdict.variant}>{verdict.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {method.assumptions}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fórmula Mágica (Joel Greenblatt)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Earnings Yield (EBIT/EV)</p>
            <p className="text-xl font-semibold tabular-nums">
              {summary.greenblatt.earningsYield !== null
                ? formatSignedPercent(summary.greenblatt.earningsYield).replace("+", "")
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ROIC</p>
            <p className="text-xl font-semibold tabular-nums">
              {summary.greenblatt.roic !== null
                ? formatSignedPercent(summary.greenblatt.roic).replace("+", "")
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Ranking Magic Formula</p>
            <p className="text-xl font-semibold tabular-nums">
              {summary.greenblatt.rank !== null
                ? `#${summary.greenblatt.rank} de ${summary.greenblatt.universeSize}`
                : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {!summary.hasFundamentals && (
        <p className="text-sm text-muted-foreground">
          Este ativo ainda não possui dados fundamentais. Os cálculos ficarão disponíveis quando as
          integrações de mercado forem ativadas.
        </p>
      )}

      <AssumptionsDialog
        open={assumptionsOpen}
        onOpenChange={setAssumptionsOpen}
        ticker={summary.ticker}
      />
    </div>
  );
}

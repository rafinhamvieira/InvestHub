"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarClock, Coins, Download, Loader2 } from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/utils/format";
import { formatDateOnly } from "@/utils/date";
import type { DividendOverview, DividendRow } from "@/types/dividends";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PERIODS = [
  { value: "12m", label: "Últimos 12 meses" },
  { value: "24m", label: "Últimos 2 anos" },
  { value: "60m", label: "Últimos 5 anos" },
  { value: "all", label: "Desde o início" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

function toCsv(rows: DividendRow[]): string {
  const header = "Ativo;Tipo;Data-com;Pagamento;Valor por cota;Quantidade;Total";
  const lines = rows.map((row) =>
    [
      row.ticker,
      row.type,
      formatDateOnly(row.exDate),
      row.paymentDate ? formatDateOnly(row.paymentDate) : "",
      row.valuePerShare.toFixed(6).replace(".", ","),
      row.quantity,
      row.total.toFixed(2).replace(".", ","),
    ].join(";"),
  );
  return [header, ...lines].join("\n");
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function DividendsView({ initial }: { initial: DividendOverview }) {
  const [overview, setOverview] = useState(initial);
  const [period, setPeriod] = useState<Period>("12m");
  const [isPending, startTransition] = useTransition();

  async function changePeriod(next: Period) {
    setPeriod(next);
    const response = await fetch(`/api/dividends?period=${next}`);
    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível carregar os proventos."));
      return;
    }
    const data: DividendOverview = await response.json();
    startTransition(() => setOverview(data));
  }

  function exportCsv() {
    const blob = new Blob([toCsv(overview.received)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `proventos-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const { totals, upcoming, received, byAsset, byMonth, byYear } = overview;
  const upcomingTotal = upcoming.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proventos</h1>
          <p className="text-sm text-muted-foreground">
            Dividendos, JCP e rendimentos cruzados com a sua custódia na data-com.
            {overview.lastSyncAt &&
              ` Última importação em ${new Date(overview.lastSyncAt).toLocaleDateString("pt-BR")}.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(value) => changePeriod(value as Period)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv} disabled={received.length === 0}>
            {isPending ? <Loader2 className="animate-spin" /> : <Download />}
            CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Últimos 12 meses"
          value={formatCurrency(totals.last12m)}
          hint={`Média de ${formatCurrency(overview.monthlyAverage12m)} por mês`}
        />
        <StatCard label="Últimos 2 anos" value={formatCurrency(totals.last24m)} />
        <StatCard label="Últimos 5 anos" value={formatCurrency(totals.last60m)} />
        <StatCard
          label="Yield on cost (12m)"
          value={overview.yieldOnCost12m !== null ? formatPercent(overview.yieldOnCost12m) : "—"}
          hint={`Total recebido: ${formatCurrency(totals.allTime)}`}
        />
      </div>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">
                A receber — {formatCurrency(upcomingTotal)}
              </CardTitle>
            </div>
            <CardDescription>
              Proventos já anunciados que ainda não foram pagos. Quando a data-com ainda não
              passou, a quantidade é a posição de hoje.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Data-com</TableHead>
                  <TableHead className="text-right">Pagamento</TableHead>
                  <TableHead className="text-right">Por cota</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.ticker}</TableCell>
                    <TableCell className="text-muted-foreground">{row.type}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDateOnly(row.exDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.paymentDate ? formatDateOnly(row.paymentDate) : "a definir"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.valuePerShare)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity}
                      {row.estimated && (
                        <Badge variant="secondary" className="ml-2">
                          estimado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(row.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recebidos por mês</CardTitle>
        </CardHeader>
        <CardContent>
          {byMonth.some((point) => point.total > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byMonth} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: number) => formatCompactCurrency(value)}
                  width={70}
                />
                <ChartTooltip
                  cursor={{ fill: "hsl(var(--accent))" }}
                  formatter={(value: number) => [formatCurrency(value), "Proventos"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="total" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum provento recebido no período.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="extrato">
        <TabsList>
          <TabsTrigger value="extrato">Extrato</TabsTrigger>
          <TabsTrigger value="ativo">Por ativo</TabsTrigger>
          <TabsTrigger value="ano">Por ano</TabsTrigger>
        </TabsList>

        <TabsContent value="extrato">
          <Card>
            <CardContent className="p-0 pb-4">
              {received.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Coins className="size-8 text-muted-foreground" />
                  <p className="max-w-md text-sm text-muted-foreground">
                    Nenhum provento no período. Os dados chegam na sincronização automática —
                    se a carteira é nova, aguarde o próximo ciclo ou atualize pelo ícone ↻ no
                    topo da tela.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ativo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Data-com</TableHead>
                      <TableHead className="text-right">Pagamento</TableHead>
                      <TableHead className="text-right">Por cota</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {received.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.ticker}</TableCell>
                        <TableCell className="text-muted-foreground">{row.type}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDateOnly(row.exDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.paymentDate ? formatDateOnly(row.paymentDate) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.valuePerShare)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(row.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ativo">
          <Card>
            <CardContent className="p-0 pb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="text-right">Proventos</TableHead>
                    <TableHead className="text-right">Último</TableHead>
                    <TableHead className="text-right">Yield on cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byAsset.map((row) => (
                    <TableRow key={row.assetId}>
                      <TableCell>
                        <span className="font-medium">{row.ticker}</span>
                        <span className="block text-xs text-muted-foreground">{row.name}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.events}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.lastPayment ? formatDateOnly(row.lastPayment) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.yieldOnCost !== null ? formatPercent(row.yieldOnCost) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ano">
          <Card>
            <CardContent className="p-0 pb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ano</TableHead>
                    <TableHead className="text-right">Total recebido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byYear.map((row) => (
                    <TableRow key={row.year}>
                      <TableCell className="font-medium tabular-nums">{row.year}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

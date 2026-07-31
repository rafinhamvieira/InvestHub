"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DividendItem, DividendYearPoint } from "@/types/asset-detail";
import { formatDateOnly } from "@/utils/date";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatPerShare(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
  });
}

export function DividendsPanel({
  dividends,
  byYear,
}: {
  dividends: DividendItem[];
  byYear: DividendYearPoint[];
}) {
  if (dividends.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Sem histórico de proventos. Disponível quando as integrações forem ativadas.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {byYear.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proventos por ano (por cota)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byYear} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => formatPerShare(v)}
                  width={90}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--accent))" }}
                  formatter={(value: number) => [formatPerShare(value), "Por cota"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="total" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de proventos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Data ex</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Valor por cota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dividends.map((dividend) => (
                <TableRow key={dividend.id}>
                  <TableCell>
                    <Badge variant="secondary">{dividend.type}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateOnly(dividend.exDate)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {dividend.paymentDate
                      ? formatDateOnly(dividend.paymentDate)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPerShare(dividend.valuePerShare)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HistorySeries } from "@/types/asset-detail";

function formatValue(value: number, format: HistorySeries["format"]): string {
  const text = value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return format === "percent" ? `${text}%` : text;
}

export function HistoryPanel({ series }: { series: HistorySeries[] }) {
  const withData = series.filter((s) => s.points.length > 1);

  if (withData.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Sem série histórica de indicadores. Disponível quando as integrações forem ativadas.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {withData.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle className="text-base">Histórico — {s.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={s.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(0, 7)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatValue(v, s.format)}
                  width={60}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  formatter={(value: number) => [formatValue(value, s.format), s.label]}
                  labelFormatter={(label: string) => label}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

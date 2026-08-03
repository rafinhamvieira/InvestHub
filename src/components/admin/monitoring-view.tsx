"use client";

import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { extractApiError } from "@/utils/api-error";
import { formatPercent } from "@/utils/format";
import type { MonitoringPoint, MonitoringSeries } from "@/types/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const RANGES: { value: MonitoringSeries["range"]; label: string }[] = [
  { value: "24h", label: "24 horas" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

export function MonitoringView({ initial }: { initial: MonitoringSeries }) {
  const [data, setData] = useState(initial);
  const [isLoading, setIsLoading] = useState(false);

  async function load(range: MonitoringSeries["range"]) {
    setIsLoading(true);
    const response = await fetch(`/api/admin/monitoring?range=${range}`);
    setIsLoading(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível carregar a série."));
      return;
    }

    setData(await response.json());
  }

  const { availability: disponibilidade } = data;
  // Em 30 dias o eixo agrupa por dia; nas demais janelas, por hora.
  const timeLabel = (at: string) => format(new Date(at), data.range === "30d" ? "dd/MM" : "dd/MM HH:mm");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monitoramento</h1>
          <p className="text-sm text-muted-foreground">
            Como a plataforma esteve, e não só como está agora. As amostras são coletadas a
            cada {data.intervalMinutes} minutos pelo próprio healthcheck.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {RANGES.map((range) => (
            <Button
              key={range.value}
              variant={data.range === range.value ? "default" : "outline"}
              size="sm"
              disabled={isLoading}
              onClick={() => load(range.value)}
            >
              {range.label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" disabled={isLoading} onClick={() => load(data.range)}>
            {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" />
            Disponibilidade em {data.rangeLabel}
          </CardTitle>
          <CardDescription>
            Amostra saudável é a que foi gravada <strong>e</strong> estava em ordem. As que
            faltaram contam contra: com o banco fora do ar não há como gravar a amostra que
            diria isso, então o buraco na série é o próprio registro da queda.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Figure
            label="Disponibilidade"
            value={formatPercent(disponibilidade.ratio)}
            tone={disponibilidade.ratio >= 0.99 ? "positive" : "negative"}
          />
          <Figure
            label="Amostras coletadas"
            value={`${disponibilidade.collected.toLocaleString("pt-BR")} de ${disponibilidade.expected.toLocaleString("pt-BR")}`}
          />
          <Figure label="Degradadas" value={disponibilidade.degraded.toLocaleString("pt-BR")} />
          <Figure
            label="Ausentes"
            value={disponibilidade.missing.toLocaleString("pt-BR")}
            tone={disponibilidade.missing > 0 ? "negative" : "neutral"}
          />
        </CardContent>
      </Card>

      {data.points.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma amostra nesta janela ainda. A primeira é gravada no próximo healthcheck
            depois de a aplicação subir; a série se forma ao longo das horas seguintes.
          </CardContent>
        </Card>
      ) : (
        <>
          <ChartCard
            title="Tempo de resposta"
            description="Média e pico por intervalo, em milissegundos. O pico é o que o usuário sente."
          >
            <LineChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="at" tickFormatter={timeLabel} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={50} unit=" ms" />
              <Tooltip
                labelFormatter={(at: string) => timeLabel(at)}
                formatter={(value: number, name: string) => [`${Math.round(value)} ms`, name]}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
              <Line type="monotone" dataKey="databaseMsAvg" name="Banco (média)" stroke="hsl(var(--chart-1))" dot={false} />
              <Line type="monotone" dataKey="databaseMsMax" name="Banco (pico)" stroke="hsl(var(--chart-1))" strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="cacheMsAvg" name="Cache (média)" stroke="hsl(var(--chart-2))" dot={false} />
            </LineChart>
          </ChartCard>

          <ChartCard
            title="Cobertura de fundamentos"
            description="O avanço da rotação limitada pela cota diária do provedor. Linha plana significa rotação parada."
          >
            <LineChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="at" tickFormatter={timeLabel} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                width={50}
                domain={[0, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              />
              <Tooltip
                labelFormatter={(at: string) => timeLabel(at)}
                formatter={(value: number) => [formatPercent(value), "Cobertura"]}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
              <Line type="monotone" dataKey="coverageAvg" name="Cobertura" stroke="hsl(var(--chart-3))" dot={false} />
            </LineChart>
          </ChartCard>

          <ChartCard
            title="Falhas de sincronização"
            description="Falhas seguidas acumuladas. Volta a zero no primeiro sucesso — degrau que sobe e não desce é sincronização parada."
          >
            <LineChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="at" tickFormatter={timeLabel} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={40} allowDecimals={false} />
              <Tooltip
                labelFormatter={(at: string) => timeLabel(at)}
                formatter={(value: number) => [value, "Falhas seguidas"]}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
              <Line type="monotone" dataKey="syncFailuresMax" name="Falhas" stroke="hsl(var(--destructive))" dot={false} />
            </LineChart>
          </ChartCard>
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === "positive"
            ? "text-xl font-semibold text-success"
            : tone === "negative"
              ? "text-xl font-semibold text-destructive"
              : "text-xl font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export type { MonitoringPoint };

"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Coins,
  Database,
  LineChart,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { formatDuration, formatPercent } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { AdminDashboard, HealthCheck, HealthStatus } from "@/types/admin";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Recarrega a saúde sozinho: o painel costuma ficar aberto num monitor durante um incidente. */
const AUTO_REFRESH_MS = 60_000;

const STATUS_STYLE: Record<
  HealthStatus,
  { label: string; badge: "success" | "warning" | "destructive"; icon: typeof CheckCircle2; tone: string }
> = {
  ok: { label: "Tudo certo", badge: "success", icon: CheckCircle2, tone: "text-success" },
  warn: { label: "Requer atenção", badge: "warning", icon: AlertTriangle, tone: "text-warning" },
  down: { label: "Com falha", badge: "destructive", icon: XCircle, tone: "text-destructive" },
};

export function AdminDashboardView({ initial }: { initial: AdminDashboard }) {
  const [data, setData] = useState(initial);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);

    const response = await fetch("/api/admin/dashboard");

    if (!response.ok) {
      if (!silent) {
        setIsRefreshing(false);
        toast.error(await extractApiError(response, "Não foi possível atualizar o painel."));
      }
      return;
    }

    setData((await response.json()) as AdminDashboard);
    if (!silent) setIsRefreshing(false);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      // Aba escondida não consome banco: o número seria lido e jogado fora.
      if (document.visibilityState === "visible") void refresh(true);
    }, AUTO_REFRESH_MS);

    return () => clearInterval(timer);
  }, [refresh]);

  const { health, metrics } = data;
  const overall = STATUS_STYLE[health.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground">
            Tamanho da operação e estado dos serviços. Atualiza sozinho a cada minuto.
          </p>
        </div>

        <Button variant="outline" onClick={() => refresh()} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              Saúde dos serviços
            </CardTitle>
            <CardDescription>
              Aplicação no ar há {formatDuration(health.uptimeSeconds)}. Apurado às{" "}
              {new Date(health.generatedAt).toLocaleTimeString("pt-BR")}.
            </CardDescription>
          </div>
          <Badge variant={overall.badge}>{overall.label}</Badge>
        </CardHeader>

        <CardContent className="grid gap-3 sm:grid-cols-2">
          {health.checks.map((check) => (
            <HealthRow key={check.key} check={check} />
          ))}
        </CardContent>
      </Card>

      {metrics ? (
        <>
          <Section title="Contas">
            <StatCard
              title="Cadastradas"
              value={metrics.users.total.toLocaleString("pt-BR")}
              icon={Users}
              hint={`${metrics.users.staff} com acesso administrativo`}
            />
            <StatCard
              title="Ativas em 30 dias"
              value={metrics.users.active30d.toLocaleString("pt-BR")}
              icon={Activity}
              hint={
                metrics.users.total === 0
                  ? "Sem base para comparar"
                  : `${formatPercent(metrics.users.active30d / metrics.users.total)} da base`
              }
            />
            <StatCard
              title="Novas em 30 dias"
              value={metrics.users.new30d.toLocaleString("pt-BR")}
              icon={UserPlus}
              hint={`${metrics.users.new7d} nos últimos 7 dias`}
            />
            <StatCard
              title="Com 2FA"
              value={metrics.users.twoFactor.toLocaleString("pt-BR")}
              icon={ShieldCheck}
              hint={`${metrics.users.unverified} sem e-mail confirmado`}
            />
          </Section>

          <Section title="Dados de mercado">
            <StatCard
              title="Ativos no catálogo"
              value={metrics.coverage.activeAssets.toLocaleString("pt-BR")}
              icon={Database}
              hint="Espelhados do provedor, prontos para o screener"
            />
            <StatCard
              title="Cobertura de fundamentos"
              value={formatPercent(metrics.coverage.fundamentalsRatio)}
              icon={LineChart}
              hint={`${metrics.coverage.withFundamentals} de ${metrics.coverage.activeAssets} ativos`}
            />
            <StatCard
              title="Com proventos importados"
              value={metrics.coverage.withDividends.toLocaleString("pt-BR")}
              icon={Coins}
              hint="Base do Dividend Yield calculado localmente"
            />
          </Section>

          <p className="text-xs text-muted-foreground">
            Este painel não mostra carteira, patrimônio, transações nem proventos de
            usuários — nem somados. A promessa de que ninguém enxerga a carteira alheia vale
            para o total tanto quanto para a linha.
          </p>
        </>
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Seu cargo enxerga o estado dos serviços, mas não os números da plataforma.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function HealthRow({ check }: { check: HealthCheck }) {
  const style = STATUS_STYLE[check.status];
  const Icon = style.icon;

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", style.tone)} />
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{check.label}</p>
        <p className="text-xs text-muted-foreground">{check.detail}</p>
      </div>
    </div>
  );
}

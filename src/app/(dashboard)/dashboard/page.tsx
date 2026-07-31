import type { Metadata } from "next";
import {
  Banknote,
  CalendarClock,
  Percent,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { dashboardService } from "@/services/dashboard.service";
import { formatCurrency, formatPercent, formatSignedPercent } from "@/utils/format";
import { StatCard } from "@/components/dashboard/stat-card";
import { EvolutionChart } from "@/components/dashboard/evolution-chart";
import { DividendsChart } from "@/components/dashboard/dividends-chart";
import { AllocationDonut } from "@/components/dashboard/allocation-donut";
import { EmptyDashboard } from "@/components/dashboard/empty-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  const data = await dashboardService.getDashboard(session!.user.id);

  if (!data.hasData) return <EmptyDashboard />;

  const { summary } = data;
  const isProfit = summary.profit >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da sua carteira.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Patrimônio total" value={formatCurrency(summary.totalValue)} icon={Wallet} />
        <StatCard
          title="Valor investido"
          value={formatCurrency(summary.totalInvested)}
          icon={Banknote}
        />
        <StatCard
          title={isProfit ? "Lucro" : "Prejuízo"}
          value={formatCurrency(Math.abs(summary.profit))}
          hint={formatSignedPercent(summary.profitPercent)}
          tone={isProfit ? "positive" : "negative"}
          icon={isProfit ? TrendingUp : TrendingDown}
        />
        <StatCard
          title="DY da carteira (12m)"
          value={formatPercent(summary.portfolioYield12m)}
          icon={Percent}
        />
        <StatCard
          title="Dividendos acumulados"
          value={formatCurrency(summary.dividendsAccumulated)}
          tone="positive"
          icon={PiggyBank}
        />
        <StatCard
          title="Dividendos previstos"
          value={formatCurrency(summary.dividendsUpcoming)}
          icon={CalendarClock}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução do patrimônio</CardTitle>
          </CardHeader>
          <CardContent>
            <EvolutionChart data={data.evolution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proventos por mês (12m)</CardTitle>
          </CardHeader>
          <CardContent>
            <DividendsChart data={data.dividendsByMonth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alocação por setor</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationDonut data={data.bySector} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alocação por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationDonut data={data.byType} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

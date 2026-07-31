import type { Metadata } from "next";
import { Banknote, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { portfolioService } from "@/services/portfolio.service";
import { formatCurrency, formatSignedPercent } from "@/utils/format";
import { StatCard } from "@/components/dashboard/stat-card";
import { PortfolioView } from "@/components/portfolio/portfolio-view";

export const metadata: Metadata = { title: "Minha Carteira" };

export default async function PortfolioPage() {
  const session = await auth();
  const data = await portfolioService.getPortfolio(session!.user.id);
  const isProfit = data.totals.profit >= 0;

  return (
    <div className="space-y-6">
      {data.positions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            title="Patrimônio"
            value={formatCurrency(data.totals.totalValue)}
            icon={Wallet}
          />
          <StatCard
            title="Investido"
            value={formatCurrency(data.totals.totalInvested)}
            icon={Banknote}
          />
          <StatCard
            title={isProfit ? "Lucro" : "Prejuízo"}
            value={formatCurrency(Math.abs(data.totals.profit))}
            hint={formatSignedPercent(data.totals.profitPercent)}
            tone={isProfit ? "positive" : "negative"}
            icon={isProfit ? TrendingUp : TrendingDown}
          />
        </div>
      )}

      <PortfolioView data={data} />
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  Building2,
  Coins,
  Landmark,
  LineChart,
  Loader2,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { formatCurrency, formatPercent, formatSignedPercent } from "@/utils/format";
import { formatDateOnly } from "@/utils/date";
import type { PortfolioGroup, PositionDTO } from "@/types/portfolio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AssetType } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const GROUP_ICONS: Record<AssetType, typeof Wallet> = {
  STOCK: LineChart,
  FII: Building2,
  ETF: Coins,
  BDR: Wallet,
  TREASURY: Landmark,
  FIXED_INCOME: PiggyBank,
};

function Metric({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-24 text-right", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{children}</p>
    </div>
  );
}

/** Verde para ganho, vermelho para perda — traço quando não há base de comparação. */
function Signed({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={value >= 0 ? "text-success" : "text-destructive"}>
      {formatSignedPercent(value)}
    </span>
  );
}

function FixedIncomeRows({ positions }: { positions: PositionDTO[] }) {
  const router = useRouter();
  const [redeeming, setRedeeming] = useState<string | null>(null);

  async function redeem(position: PositionDTO) {
    setRedeeming(position.assetId);

    const response = await fetch("/api/portfolio/fixed-income/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: position.assetId }),
    });

    setRedeeming(null);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível registrar o resgate."));
      return;
    }

    toast.success(`${position.name} baixado da carteira.`);
    router.refresh();
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Remuneração</TableHead>
          <TableHead className="text-right">Vencimento</TableHead>
          <TableHead className="text-right">Aplicado</TableHead>
          <TableHead className="text-right">Valor atual</TableHead>
          <TableHead className="text-right">Rendimento</TableHead>
          <TableHead className="text-right">% carteira</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position) => {
          const maturity = position.fixedIncome?.maturityDate;
          const matured = maturity ? new Date(maturity) <= new Date() : false;

          return (
            <TableRow key={position.assetId}>
              <TableCell>
                <span className="font-medium">{position.name}</span>
                {position.fixedIncome?.issuer && (
                  <p className="text-xs text-muted-foreground">{position.fixedIncome.issuer}</p>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {position.fixedIncome?.remuneration ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {maturity ? formatDateOnly(maturity) : "sem vencimento"}
                {matured && (
                  <Badge variant="warning" className="ml-2">
                    vencido
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(position.totalInvested)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrency(position.currentValue)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <Signed value={position.profitPercent} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(position.weight)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={redeeming === position.assetId}
                  onClick={() => redeem(position)}
                >
                  {redeeming === position.assetId && <Loader2 className="animate-spin" />}
                  Resgatar
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function VariableIncomeRows({ positions }: { positions: PositionDTO[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ativo</TableHead>
          <TableHead className="text-right">Qtd.</TableHead>
          <TableHead className="text-right">Preço médio</TableHead>
          <TableHead className="text-right">Preço atual</TableHead>
          <TableHead className="text-right">Investido</TableHead>
          <TableHead className="text-right">Valor atual</TableHead>
          <TableHead className="text-right">Resultado</TableHead>
          <TableHead className="text-right">% carteira</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position) => (
          <TableRow key={position.assetId}>
            <TableCell>
              <Link href={`/asset/${position.ticker}`} className="font-medium hover:underline">
                {position.ticker}
              </Link>
              <p className="max-w-40 truncate text-xs text-muted-foreground">{position.name}</p>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {position.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(position.averagePrice)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(position.currentPrice)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(position.totalInvested)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatCurrency(position.currentValue)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <Signed value={position.profitPercent} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(position.weight)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GroupCard({ group }: { group: PortfolioGroup }) {
  const [open, setOpen] = useState(false);
  const Icon = GROUP_ICONS[group.assetType];
  const isFixedIncome = group.assetType === "TREASURY" || group.assetType === "FIXED_INCOME";

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border">
          <Icon className="size-4" />
        </span>
        <span className="flex-1 font-medium">{group.label}</span>

        <div className="hidden items-start gap-6 sm:flex">
          <Metric label="Ativos">{group.positions.length}</Metric>
          <Metric label="Valor total">{formatCurrency(group.totalValue)}</Metric>
          <Metric label="Variação">
            <Signed value={group.dayChange} />
          </Metric>
          <Metric label="Rentabilidade">
            <Signed value={group.profitPercent} />
          </Metric>
          <Metric label="% na carteira">
            {formatPercent(group.weight)}
            <span className="text-muted-foreground">
              {" / "}
              {group.target !== null ? formatPercent(group.target) : "—"}
            </span>
          </Metric>
        </div>

        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Telas estreitas não comportam a régua de métricas no cabeçalho. */}
      <div className="grid grid-cols-2 gap-3 border-t px-4 py-3 sm:hidden">
        <Metric label="Valor total" className="text-left">
          {formatCurrency(group.totalValue)}
        </Metric>
        <Metric label="Rentabilidade" className="text-left">
          <Signed value={group.profitPercent} />
        </Metric>
      </div>

      {open && (
        <div className="border-t">
          {isFixedIncome ? (
            <FixedIncomeRows positions={group.positions} />
          ) : (
            <VariableIncomeRows positions={group.positions} />
          )}
        </div>
      )}
    </Card>
  );
}

export function PortfolioGroups({ groups }: { groups: PortfolioGroup[] }) {
  if (groups.length === 0) {
    return (
      <Card>
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhuma posição aberta. Registre sua primeira transação.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <GroupCard key={group.assetType} group={group} />
      ))}
    </div>
  );
}

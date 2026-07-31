import Link from "next/link";
import { formatCurrency, formatPercent, formatSignedPercent } from "@/utils/format";
import type { PositionDTO } from "@/types/portfolio";
import { AssetTypeBadge } from "@/components/portfolio/asset-type-badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PositionsTable({ positions }: { positions: PositionDTO[] }) {
  if (positions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Nenhuma posição aberta. Registre sua primeira transação.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ativo</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead className="text-right">Quantidade</TableHead>
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
              <Link
                href={`/asset/${position.ticker}`}
                className="font-medium text-foreground hover:underline"
              >
                {position.ticker}
              </Link>
              <p className="max-w-40 truncate text-xs text-muted-foreground">{position.name}</p>
            </TableCell>
            <TableCell>
              <AssetTypeBadge type={position.assetType} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{position.quantity}</TableCell>
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
            <TableCell
              className={cn(
                "text-right tabular-nums",
                position.profit >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {formatCurrency(position.profit)}
              <span className="block text-xs">{formatSignedPercent(position.profitPercent)}</span>
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

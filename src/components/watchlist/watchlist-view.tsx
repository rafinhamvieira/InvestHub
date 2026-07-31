"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star, StarOff } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import type { WatchlistRow } from "@/services/watchlist.service";
import { AssetTypeBadge } from "@/components/portfolio/asset-type-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatNumber(value: number | null, suffix = ""): string {
  if (value === null) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix}`;
}

export function WatchlistView({ rows }: { rows: WatchlistRow[] }) {
  const router = useRouter();

  async function remove(row: WatchlistRow) {
    const response = await fetch("/api/watchlist/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: row.assetId }),
    });
    if (!response.ok) {
      toast.error("Não foi possível remover o ativo.");
      return;
    }
    toast.success(`${row.ticker} removido da lista.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lista de Observação</h1>
        <p className="text-sm text-muted-foreground">
          Ativos favoritados nos screeners e nas telas de ativo.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Star className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum ativo na lista. Use a estrela nos screeners para adicionar.
              </p>
              <Link
                href="/screener/stocks"
                className="text-sm font-medium text-primary hover:underline"
              >
                Abrir screener de ações
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">DY</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                  <TableHead className="text-right">P/VP</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.assetId}>
                    <TableCell>
                      <Link href={`/asset/${row.ticker}`} className="font-medium hover:underline">
                        {row.ticker}
                      </Link>
                      <p className="max-w-48 truncate text-xs text-muted-foreground">{row.name}</p>
                    </TableCell>
                    <TableCell>
                      <AssetTypeBadge type={row.type} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.sector ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.price !== null ? formatCurrency(row.price) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.dy, "%")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.pl)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.pvp)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(row)}
                        aria-label={`Remover ${row.ticker}`}
                      >
                        <StarOff className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

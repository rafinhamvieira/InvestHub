"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { applyFilters, applySearch, sortRows } from "@/utils/screener-filter";
import { buildCsv } from "@/utils/csv";
import { formatCompactCurrency, formatCurrency } from "@/utils/format";
import type {
  ColumnFormat,
  FilterValues,
  ScreenerConfig,
  ScreenerRow,
  ScreenerValue,
} from "@/types/screener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBadge } from "@/components/shared/score-badge";
import { ScoreWeightsDialog } from "@/components/shared/score-weights-dialog";
import { cn } from "@/lib/utils";
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

const ALL_OPTION = "__all__";

function formatValue(value: ScreenerValue, format: ColumnFormat): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  switch (format) {
    case "currency":
      return formatCurrency(value);
    case "compact":
      return formatCompactCurrency(value);
    case "percent":
      return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
    case "number":
      return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    default:
      return String(value);
  }
}

interface ScreenerShellProps {
  config: ScreenerConfig;
  rows: ScreenerRow[];
}

export function ScreenerShell({ config, rows: initialRows }: ScreenerShellProps) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [sortKey, setSortKey] = useState<string>("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const selectOptions = useMemo(() => {
    const options = new Map<string, string[]>();
    for (const filter of config.filters) {
      if (filter.kind !== "select") continue;
      const values = new Set<string>();
      for (const row of initialRows) {
        const value = row[filter.key];
        if (typeof value === "string" && value) values.add(value);
      }
      options.set(filter.key, [...values].sort((a, b) => a.localeCompare(b)));
    }
    return options;
  }, [config.filters, initialRows]);

  const visible = useMemo(() => {
    let result = applySearch(rows, search);
    result = applyFilters(result, filters);
    if (favoritesOnly) result = result.filter((r) => r.favorite);
    return sortRows(result, sortKey, sortDir);
  }, [rows, search, filters, favoritesOnly, sortKey, sortDir]);

  const activeFilterCount = Object.values(filters).filter(
    (f) => f.min !== undefined || f.max !== undefined || (f.value && f.value !== ""),
  ).length;

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function setRange(key: string, bound: "min" | "max", raw: string) {
    setFilters((prev) => {
      const parsed = raw === "" ? undefined : Number(raw.replace(",", "."));
      const next = { ...prev, [key]: { ...prev[key], [bound]: Number.isFinite(parsed as number) ? parsed : undefined } };
      return next;
    });
  }

  async function toggleFavorite(row: ScreenerRow) {
    // Otimista: atualiza UI antes da resposta.
    setRows((prev) =>
      prev.map((r) => (r.assetId === row.assetId ? { ...r, favorite: !r.favorite } : r)),
    );

    const response = await fetch("/api/watchlist/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: row.assetId }),
    });

    if (!response.ok) {
      setRows((prev) =>
        prev.map((r) => (r.assetId === row.assetId ? { ...r, favorite: row.favorite } : r)),
      );
      toast.error("Não foi possível atualizar o favorito.");
    }
  }

  function exportCsv() {
    const csv = buildCsv(visible, [
      { key: "ticker", label: "Ticker" },
      { key: "name", label: "Nome" },
      ...config.columns.map((c) => ({ key: c.key, label: c.label })),
    ]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${config.csvName}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
        <p className="text-sm text-muted-foreground">{config.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar ticker ou nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-9"
          />
        </div>

        <Button variant="outline" onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal />
          Filtros
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <Button
          variant={favoritesOnly ? "default" : "outline"}
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          <Star className={cn(favoritesOnly && "fill-current")} />
          Favoritos
        </Button>

        <ScoreWeightsDialog />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{visible.length} ativos</span>
          <Button variant="outline" onClick={exportCsv} disabled={visible.length === 0}>
            <Download />
            CSV
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {config.filters.map((filter) => (
              <div key={filter.key} className="space-y-1.5">
                <Label className="text-xs">{filter.label}</Label>
                {filter.kind === "range" ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      placeholder={`Mín${filter.unit ? ` ${filter.unit}` : ""}`}
                      inputMode="decimal"
                      className="h-8 text-xs"
                      value={filters[filter.key]?.min ?? ""}
                      onChange={(e) => setRange(filter.key, "min", e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      placeholder={`Máx${filter.unit ? ` ${filter.unit}` : ""}`}
                      inputMode="decimal"
                      className="h-8 text-xs"
                      value={filters[filter.key]?.max ?? ""}
                      onChange={(e) => setRange(filter.key, "max", e.target.value)}
                    />
                  </div>
                ) : filter.kind === "select" ? (
                  <Select
                    value={filters[filter.key]?.value ?? ALL_OPTION}
                    onValueChange={(v) =>
                      setFilters((prev) => ({
                        ...prev,
                        [filter.key]: { value: v === ALL_OPTION ? "" : v },
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_OPTION}>Todos</SelectItem>
                      {(selectOptions.get(filter.key) ?? []).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Contém..."
                    className="h-8 text-xs"
                    value={filters[filter.key]?.value ?? ""}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, [filter.key]: { value: e.target.value } }))
                    }
                  />
                )}
              </div>
            ))}
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({})}
                disabled={activeFilterCount === 0}
              >
                <X />
                Limpar filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead
                  className="sticky left-0 cursor-pointer bg-card"
                  onClick={() => toggleSort("ticker")}
                >
                  <span className="flex items-center gap-1">
                    Ativo
                    {sortKey === "ticker" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 opacity-40" />
                    )}
                  </span>
                </TableHead>
                {config.columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn("cursor-pointer whitespace-nowrap text-right", column.minWidth)}
                    onClick={() => toggleSort(column.key)}
                  >
                    <span className="flex items-center justify-end gap-1">
                      {column.label}
                      {sortKey === column.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={config.columns.length + 2}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Nenhum ativo encontrado com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((row) => (
                  <TableRow key={row.assetId}>
                    <TableCell>
                      <button
                        onClick={() => toggleFavorite(row)}
                        aria-label={row.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        className="text-muted-foreground transition-colors hover:text-warning"
                      >
                        <Star
                          className={cn("size-4", row.favorite && "fill-warning text-warning")}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="sticky left-0 bg-card">
                      <Link href={`/asset/${row.ticker}`} className="font-medium hover:underline">
                        {row.ticker}
                      </Link>
                      <p className="max-w-40 truncate text-xs text-muted-foreground">{row.name}</p>
                    </TableCell>
                    {config.columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "whitespace-nowrap text-right tabular-nums",
                          column.format === "text" && "text-left",
                        )}
                      >
                        {column.format === "score" ? (
                          <ScoreBadge score={row[column.key] as number | null} />
                        ) : (
                          formatValue(row[column.key] as ScreenerValue, column.format)
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

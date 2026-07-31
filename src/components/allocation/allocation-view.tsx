"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { formatCurrency, formatPercent } from "@/utils/format";
import type { AllocationOverview, AllocationRow } from "@/types/allocation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TargetDialog } from "@/components/allocation/target-dialog";

type Level = "CLASS" | "SECTOR" | "ASSET";

interface AllocationViewProps {
  overview: AllocationOverview;
}

function LevelTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: AllocationRow[];
  onEdit: (row: AllocationRow) => void;
  onDelete: (row: AllocationRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhuma meta ou posição neste nível ainda.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Grupo</TableHead>
          <TableHead className="w-44">Atual vs alvo</TableHead>
          <TableHead className="text-right">Atual</TableHead>
          <TableHead className="text-right">Alvo</TableHead>
          <TableHead className="text-right">Diferença</TableHead>
          <TableHead className="text-right">Valor p/ meta</TableHead>
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const priority = row.diff !== null && row.diff > 0.001;
          return (
            <TableRow key={row.label}>
              <TableCell>
                <span className="font-medium">{row.displayLabel}</span>
                {priority && (
                  <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground dark:text-warning">
                    comprar
                  </span>
                )}
                <p className="text-xs text-muted-foreground">{formatCurrency(row.currentValue)}</p>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Progress value={Math.min(100, row.currentPercent * 100)} />
                  {row.targetPercent !== null && (
                    <Progress
                      value={Math.min(100, row.targetPercent * 100)}
                      indicatorClassName="bg-muted-foreground/40"
                    />
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(row.currentPercent)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.targetPercent !== null ? formatPercent(row.targetPercent) : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  row.diff !== null && row.diff > 0.001 && "text-warning-foreground dark:text-warning",
                  row.diff !== null && row.diff < -0.001 && "text-destructive",
                )}
              >
                {row.diff !== null
                  ? `${row.diff >= 0 ? "+" : ""}${(row.diff * 100).toFixed(1)} p.p.`
                  : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.valueToTarget !== null ? formatCurrency(row.valueToTarget) : "—"}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => onEdit(row)}
                    aria-label={`Editar meta de ${row.displayLabel}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  {row.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() => onDelete(row)}
                      aria-label={`Remover meta de ${row.displayLabel}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function AllocationView({ overview }: AllocationViewProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [level, setLevel] = useState<Level>("CLASS");
  const [editingRow, setEditingRow] = useState<AllocationRow | null>(null);

  function openCreate(forLevel: Level) {
    setLevel(forLevel);
    setEditingRow(null);
    setDialogOpen(true);
  }

  function openEdit(row: AllocationRow) {
    setLevel(row.level);
    setEditingRow(row);
    setDialogOpen(true);
  }

  async function handleDelete(row: AllocationRow) {
    if (!row.id) return;
    const response = await fetch(`/api/allocation/targets/${row.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível remover a meta.");
      return;
    }
    toast.success("Meta removida.");
    router.refresh();
  }

  const suggestions: Record<Level, string[]> = {
    CLASS: [],
    SECTOR: overview.bySector.map((r) => r.label).filter((l) => l !== "Sem setor"),
    ASSET: overview.byAsset.map((r) => r.label),
  };

  const levels: Array<{ key: Level; title: string; rows: AllocationRow[]; sum: number }> = [
    { key: "CLASS", title: "Por classe", rows: overview.byClass, sum: overview.sums.CLASS },
    { key: "SECTOR", title: "Por setor", rows: overview.bySector, sum: overview.sums.SECTOR },
    { key: "ASSET", title: "Por ativo", rows: overview.byAsset, sum: overview.sums.ASSET },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alocação</h1>
          <p className="text-sm text-muted-foreground">
            Metas por classe, setor e ativo — e o quanto falta para cada uma.
          </p>
        </div>
      </div>

      <Tabs defaultValue="CLASS">
        <TabsList>
          {levels.map((l) => (
            <TabsTrigger key={l.key} value={l.key}>
              {l.title}
            </TabsTrigger>
          ))}
        </TabsList>

        {levels.map((l) => (
          <TabsContent key={l.key} value={l.key}>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">{l.title}</CardTitle>
                  {l.sum > 0 && Math.abs(l.sum - 100) > 0.01 && (
                    <span className="flex items-center gap-1 text-xs text-warning-foreground dark:text-warning">
                      <TriangleAlert className="size-3.5" />
                      Metas somam {l.sum.toFixed(1)}%
                    </span>
                  )}
                </div>
                <Button size="sm" onClick={() => openCreate(l.key)}>
                  <Plus />
                  Nova meta
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <LevelTable rows={l.rows} onEdit={openEdit} onDelete={handleDelete} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <TargetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        level={level}
        row={editingRow}
        suggestions={suggestions[level]}
      />
    </div>
  );
}

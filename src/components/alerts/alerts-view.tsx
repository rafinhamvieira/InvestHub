"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Bell, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { AlertStatus, AlertType, NotificationChannel } from "@prisma/client";
import { describeAlert } from "@/utils/alert-conditions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { AlertDialog } from "@/components/alerts/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AlertRow {
  id: string;
  ticker: string;
  assetName: string;
  type: AlertType;
  targetValue: number;
  status: AlertStatus;
  channel: NotificationChannel;
  triggeredAt: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<AlertStatus, { label: string; variant: "success" | "warning" | "secondary" }> = {
  ACTIVE: { label: "Ativo", variant: "success" },
  TRIGGERED: { label: "Disparado", variant: "warning" },
  DISABLED: { label: "Desativado", variant: "secondary" },
};

export function AlertsView({ alerts }: { alerts: AlertRow[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  async function toggle(alert: AlertRow, active: boolean) {
    const response = await fetch(`/api/alerts/${alert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!response.ok) {
      toast.error("Não foi possível atualizar o alerta.");
      return;
    }
    router.refresh();
  }

  async function remove(alert: AlertRow) {
    const response = await fetch(`/api/alerts/${alert.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Não foi possível excluir o alerta.");
      return;
    }
    toast.success("Alerta excluído.");
    router.refresh();
  }

  async function checkNow() {
    setIsChecking(true);
    const response = await fetch("/api/alerts/evaluate", { method: "POST" });
    setIsChecking(false);

    if (!response.ok) {
      toast.error("Não foi possível verificar os alertas.");
      return;
    }
    const data = await response.json();
    toast.success(
      data.triggered > 0
        ? `${data.triggered} alerta(s) disparado(s).`
        : "Nenhuma condição atingida.",
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
          <p className="text-sm text-muted-foreground">
            Seja avisado quando preço, indicadores ou proventos atingirem suas condições.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={checkNow} disabled={isChecking}>
            {isChecking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Verificar agora
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            Novo alerta
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Bell className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum alerta criado. Configure o primeiro para acompanhar oportunidades.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Disparado em</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => {
                  const status = STATUS_CONFIG[alert.status];
                  return (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <span className="font-medium">{alert.ticker}</span>
                        <p className="max-w-40 truncate text-xs text-muted-foreground">
                          {alert.assetName}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-72 text-sm">
                        {describeAlert(alert.type, alert.targetValue, alert.ticker)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {alert.channel === "EMAIL" ? "E-mail" : "No app"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {alert.triggeredAt
                          ? format(new Date(alert.triggeredAt), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Switch
                            checked={alert.status === "ACTIVE"}
                            onCheckedChange={(checked) => toggle(alert, checked)}
                            aria-label="Ativar/desativar alerta"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(alert)}
                            aria-label="Excluir alerta"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

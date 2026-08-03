"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  DatabaseBackup,
  Download,
  FlaskConical,
  Loader2,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { formatBytes } from "@/utils/format";
import type { BackupFile, RestoreDrillReport } from "@/types/admin";
import { StepUpDialog } from "@/components/admin/step-up-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function BackupView({
  initial,
  canRestore,
  adminTwoFactorEnabled,
}: {
  initial: BackupFile[];
  /** Só o super administrador ensaia restauração. */
  canRestore: boolean;
  adminTwoFactorEnabled: boolean;
}) {
  const [files, setFiles] = useState(initial);
  const [isCreating, setIsCreating] = useState(false);
  const [downloading, setDownloading] = useState<BackupFile | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [drilling, setDrilling] = useState<BackupFile | null>(null);
  const [reason, setReason] = useState("");
  const [isDrilling, setIsDrilling] = useState(false);
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [report, setReport] = useState<RestoreDrillReport | null>(null);

  /**
   * O ensaio pode levar minutos: carrega o dump inteiro num banco novo, confere e apaga.
   * O 428 abre a confirmação de senha e reenvia, como nas demais ações do painel.
   */
  async function runDrill() {
    if (!drilling) return;
    setIsDrilling(true);

    const response = await fetch("/api/admin/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: drilling.name, reason: reason.trim() }),
    });

    setIsDrilling(false);

    if (response.status === 428) {
      setNeedsStepUp(true);
      return;
    }

    if (!response.ok) {
      toast.error(await extractApiError(response, "O ensaio falhou."));
      return;
    }

    const result: RestoreDrillReport = await response.json();
    setReport(result);
    setDrilling(null);
    setReason("");

    if (result.warnings.length === 0 && result.auditChainValid) {
      toast.success("Backup restaurado e conferido. O arquivo serve.");
    } else {
      toast.warning("Ensaio concluído com ressalvas. Veja o laudo.");
    }
  }

  async function download() {
    if (!downloading) return;

    if (password !== confirmation) {
      toast.error("As senhas não conferem.");
      return;
    }

    setIsDownloading(true);
    const response = await fetch(`/api/admin/backup/${encodeURIComponent(downloading.name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setIsDownloading(false);
      toast.error(await extractApiError(response, "Não foi possível baixar o backup."));
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${downloading.name}.enc`;
    link.click();
    URL.revokeObjectURL(url);

    setIsDownloading(false);
    setDownloading(null);
    setPassword("");
    setConfirmation("");
    toast.success("Backup baixado. Guarde a senha: sem ela o arquivo é irrecuperável.");
  }

  async function refresh() {
    const response = await fetch("/api/admin/backup");
    if (response.ok) {
      const data: { files: BackupFile[] } = await response.json();
      setFiles(data.files);
    }
  }

  async function createBackup() {
    setIsCreating(true);
    const response = await fetch("/api/admin/backup", { method: "POST" });
    setIsCreating(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível gerar o backup."));
      return;
    }

    toast.success("Backup gerado.");
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Backup</h1>
          <p className="text-sm text-muted-foreground">
            Cópias diárias do banco, com 7 dias de retenção, mais as geradas sob demanda.
          </p>
        </div>

        <Button onClick={createBackup} disabled={isCreating}>
          {isCreating ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
          Gerar backup agora
        </Button>
      </div>

      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="flex gap-3 p-4">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-sm text-muted-foreground">
            O arquivo contém os dados de <strong>todos</strong> os usuários, inclusive os que
            este painel não exibe. Por isso o download sai sempre cifrado com uma senha que
            você define na hora — ela não é guardada em lugar nenhum, e sem ela o arquivo é
            irrecuperável. Cada geração e cada download ficam registrados na auditoria com
            autor, IP e horário.
          </p>
        </CardContent>
      </Card>

      {report && (
        <Card
          className={
            report.warnings.length === 0 && report.auditChainValid
              ? "border-success/40 bg-success/5"
              : "border-warning/40 bg-warning/5"
          }
        >
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              {report.warnings.length === 0 && report.auditChainValid ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">Ensaio de {report.file}</p>
                <p className="text-xs text-muted-foreground">
                  Restaurado num banco temporário e conferido em{" "}
                  {(report.durationMs / 1000).toFixed(1)}s. O banco foi apagado ao fim; a
                  produção não foi tocada.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {report.tables.map((table) => (
                <div key={table.label} className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{table.label}</p>
                  <p className="text-sm font-medium tabular-nums">
                    {table.backup.toLocaleString("pt-BR")}
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      / {table.current.toLocaleString("pt-BR")} hoje
                    </span>
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={report.auditChainValid ? "success" : "destructive"}>
                {report.auditChainValid ? "Trilha íntegra no backup" : "Trilha comprometida"}
              </Badge>
              <span className="text-muted-foreground">
                {report.auditRecords.toLocaleString("pt-BR")} registros de auditoria
                {report.lastValidCheckpointSeq &&
                  ` · última âncora válida no evento nº ${report.lastValidCheckpointSeq}`}
                {report.newestAuditAt &&
                  ` · evento mais recente em ${new Date(report.newestAuditAt).toLocaleString("pt-BR")}`}
              </span>
            </div>

            {report.warnings.length > 0 && (
              <ul className="list-inside list-disc space-y-1 text-xs text-warning-foreground dark:text-warning">
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Gerado em</TableHead>
                <TableHead className="text-right">Tamanho</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum backup disponível ainda. O serviço automático grava o primeiro no
                    próximo ciclo, ou gere um agora.
                  </TableCell>
                </TableRow>
              ) : (
                files.map((file) => (
                  <TableRow key={file.name}>
                    <TableCell className="font-medium">{file.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(file.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBytes(file.sizeBytes)}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      {canRestore && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Carrega este backup num banco temporário, confere e apaga"
                          onClick={() => {
                            setDrilling(file);
                            setReason("");
                            setReport(null);
                          }}
                        >
                          <FlaskConical className="size-4" />
                          Ensaiar
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setDownloading(file)}>
                        <Download className="size-4" />
                        Baixar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={downloading !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDownloading(null);
            setPassword("");
            setConfirmation("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha do arquivo</DialogTitle>
            <DialogDescription>
              O backup será cifrado com esta senha antes de sair do servidor. Guarde-a: não
              existe recuperação — nem por nós, nem por você.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="backup-password">Senha (mínimo 12 caracteres)</Label>
              <Input
                id="backup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="backup-confirmation">Repita a senha</Label>
              <Input
                id="backup-confirmation"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Para abrir depois:{" "}
              <code className="rounded bg-muted px-1">
                npx tsx scripts/decrypt-backup.ts arquivo.sql.gz.enc &quot;senha&quot;
              </code>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloading(null)}>
              Cancelar
            </Button>
            <Button onClick={download} disabled={isDownloading || password.length < 12}>
              {isDownloading && <Loader2 className="animate-spin" />}
              Baixar cifrado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={drilling !== null && !needsStepUp}
        onOpenChange={(open) => {
          if (!open && !isDrilling) {
            setDrilling(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ensaiar restauração</DialogTitle>
            <DialogDescription>
              O arquivo será carregado num banco temporário, conferido e apagado. A produção
              não é tocada em nenhum momento. Pode levar alguns minutos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="drill-reason">Motivo</Label>
            <Textarea
              id="drill-reason"
              rows={3}
              placeholder="Ex: verificação trimestral de recuperação de desastre."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enquanto o ensaio dura, existe no servidor uma cópia completa dos dados de todos
              os usuários. Por isso ele fica registrado com seu nome, IP e horário.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={isDrilling} onClick={() => setDrilling(null)}>
              Cancelar
            </Button>
            <Button onClick={runDrill} disabled={isDrilling || reason.trim().length < 10}>
              {isDrilling && <Loader2 className="animate-spin" />}
              {isDrilling ? "Restaurando e conferindo…" : "Ensaiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StepUpDialog
        open={needsStepUp}
        onOpenChange={setNeedsStepUp}
        twoFactorEnabled={adminTwoFactorEnabled}
        onConfirmed={runDrill}
      />
    </div>
  );
}

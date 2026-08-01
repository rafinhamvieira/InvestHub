"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DatabaseBackup, Download, Loader2, ShieldAlert } from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { formatBytes } from "@/utils/format";
import type { BackupFile } from "@/types/admin";
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

export function BackupView({ initial }: { initial: BackupFile[] }) {
  const [files, setFiles] = useState(initial);
  const [isCreating, setIsCreating] = useState(false);
  const [downloading, setDownloading] = useState<BackupFile | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Gerado em</TableHead>
                <TableHead className="text-right">Tamanho</TableHead>
                <TableHead className="text-right">Baixar</TableHead>
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
                    <TableCell className="text-right">
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
    </div>
  );
}

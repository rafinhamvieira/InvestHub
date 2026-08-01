"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DatabaseBackup, Download, Loader2, ShieldAlert } from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { formatBytes } from "@/utils/backup-file";
import type { BackupFile } from "@/services/admin-backup.service";
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

export function BackupView({ initial }: { initial: BackupFile[] }) {
  const [files, setFiles] = useState(initial);
  const [isCreating, setIsCreating] = useState(false);

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
            este painel não exibe. Cada geração e cada download ficam registrados na
            auditoria com autor, IP e horário. Guarde o arquivo em local seguro e apague-o
            quando não precisar mais.
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
                      <Button asChild variant="outline" size="sm">
                        <a href={`/api/admin/backup/${encodeURIComponent(file.name)}`} download>
                          <Download className="size-4" />
                          Baixar
                        </a>
                      </Button>
                    </TableCell>
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

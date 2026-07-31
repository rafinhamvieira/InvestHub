"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { extractApiError } from "@/utils/api-error";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { IMPORT_TEMPLATE_CSV } from "@/utils/import-parser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImportReport {
  totalRows: number;
  importable: number;
  imported: number;
  errors: Array<{ line: number; message: string }>;
  newTickers: string[];
  dryRun: boolean;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function reset() {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function upload(dryRun: boolean) {
    if (!file) return;
    setIsLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("dryRun", String(dryRun));

    const response = await fetch("/api/portfolio/import", { method: "POST", body: formData });
    setIsLoading(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível processar o arquivo."));
      return;
    }

    const report: ImportReport = await response.json();

    if (dryRun) {
      setPreview(report);
      return;
    }

    toast.success(`${report.imported} transação(ões) importada(s).`);
    reset();
    onOpenChange(false);
    router.refresh();
  }

  function downloadTemplate() {
    const blob = new Blob(["﻿" + IMPORT_TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "investhub-modelo-importacao.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar carteira</DialogTitle>
          <DialogDescription>
            Envie um arquivo CSV ou Excel com suas transações. Baixe o modelo para ver o formato
            esperado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download />
            Baixar modelo CSV
          </Button>

          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors hover:bg-accent"
            htmlFor="import-file"
          >
            <FileSpreadsheet className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              {file ? file.name : "Clique para escolher o arquivo"}
            </span>
            <span className="text-xs text-muted-foreground">CSV, XLSX — máx. 5 MB</span>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </label>

          {preview && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{preview.importable} válidas</Badge>
                {preview.errors.length > 0 && (
                  <Badge variant="destructive">{preview.errors.length} com erro</Badge>
                )}
                {preview.newTickers.length > 0 && (
                  <Badge variant="secondary">
                    {preview.newTickers.length} ativo(s) novo(s): {preview.newTickers.join(", ")}
                  </Badge>
                )}
              </div>
              {preview.errors.length > 0 && (
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-destructive scrollbar-thin">
                  {preview.errors.map((error) => (
                    <li key={`${error.line}-${error.message}`}>
                      Linha {error.line}: {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {preview === null ? (
            <Button onClick={() => upload(true)} disabled={!file || isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : <Upload />}
              Analisar arquivo
            </Button>
          ) : (
            <Button onClick={() => upload(false)} disabled={preview.importable === 0 || isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : <Upload />}
              Importar {preview.importable} transação(ões)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

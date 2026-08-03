"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Download,
  FileSpreadsheet,
  Loader2,

  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { AUDIT_CATEGORIES } from "@/constants/audit";
import type { AuditEntry, AuditPage, IntegrityReport } from "@/types/audit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

const ALL = "__todas__";
const PAGE_SIZE = 50;

interface Filters {
  search: string;
  category: string;
  result: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { search: "", category: ALL, result: ALL, from: "", to: "" };

function buildParams(filters: Filters, cursor?: string | null): URLSearchParams {
  const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });

  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.category !== ALL) params.set("category", filters.category);
  if (filters.result !== ALL) params.set("result", filters.result);
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59`).toISOString());
  if (cursor) params.set("cursor", cursor);

  return params;
}

function ResultBadge({ entry }: { entry: AuditEntry }) {
  return entry.result === "SUCCESS" ? (
    <Badge variant="success">sucesso</Badge>
  ) : (
    <Badge variant="destructive">falha</Badge>
  );
}

function IntegrityPanel() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  async function verify() {
    setIsVerifying(true);
    const response = await fetch("/api/admin/audit/integrity");
    setIsVerifying(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível verificar a trilha."));
      return;
    }

    const data: IntegrityReport = await response.json();
    setReport(data);
    if (data.valid) toast.success("Cadeia íntegra.");
    else toast.error("Divergência encontrada na trilha.");
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-start gap-3">
          {report === null ? (
            <ShieldAlert className="mt-0.5 size-4 text-muted-foreground" />
          ) : report.valid ? (
            <ShieldCheck className="mt-0.5 size-4 text-success" />
          ) : (
            <ShieldX className="mt-0.5 size-4 text-destructive" />
          )}

          <div className="text-sm">
            <p className="font-medium">Integridade da trilha</p>
            {report === null ? (
              <p className="text-muted-foreground">
                Cada registro é encadeado ao anterior por hash. A verificação recalcula a
                cadeia inteira e aponta o primeiro ponto divergente.
              </p>
            ) : (
              <div className="space-y-0.5 text-muted-foreground">
                <p>
                  {report.totalRecords.toLocaleString("pt-BR")} registros ·{" "}
                  {report.valid ? "nenhuma divergência" : "cadeia comprometida"} · verificado
                  em {new Date(report.verifiedAt).toLocaleString("pt-BR")} ({report.durationMs} ms)
                </p>
                {report.unchainedRecords > 0 && (
                  <p>
                    {report.unchainedRecords.toLocaleString("pt-BR")}{" "}
                    {report.unchainedRecords === 1 ? "registro é anterior" : "registros são anteriores"}{" "}
                    à cadeia e {report.unchainedRecords === 1 ? "fica" : "ficam"} fora da
                    verificação: foram gravados antes de o encadeamento existir. A conferência
                    começa no primeiro registro com hash.
                  </p>
                )}
                <p>
                  Último checkpoint válido:{" "}
                  {report.lastValidCheckpoint
                    ? `#${report.lastValidCheckpoint.seq} · ${new Date(report.lastValidCheckpoint.createdAt).toLocaleString("pt-BR")}`
                    : "nenhum (chave de assinatura ausente ou histórico curto)"}
                </p>
                {report.firstInvalidRecord && (
                  <p className="text-destructive">
                    Primeiro registro inválido: #{report.firstInvalidRecord.seq} · esperado{" "}
                    <code>{report.firstInvalidRecord.expectedHash.slice(0, 16)}…</code> ·
                    encontrado{" "}
                    <code>{report.firstInvalidRecord.foundHash?.slice(0, 16) ?? "vazio"}…</code>
                  </p>
                )}
                {report.missingSequences.length > 0 && (
                  <p className="text-destructive">
                    Sequências ausentes: {report.missingSequences.slice(0, 10).join(", ")}
                    {report.missingSequences.length > 10 && "…"}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <Button variant="outline" onClick={verify} disabled={isVerifying}>
          {isVerifying ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Verificar agora
        </Button>
      </CardContent>
    </Card>
  );
}

export function AuditView({
  initial,
  canVerifyIntegrity,
}: {
  initial: AuditPage;
  canVerifyIntegrity: boolean;
}) {
  const [data, setData] = useState(initial);
  const [entries, setEntries] = useState(initial.entries);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback(async (active: Filters, cursor?: string | null) => {
    setIsLoading(true);
    const response = await fetch(`/api/admin/audit?${buildParams(active, cursor)}`);
    setIsLoading(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível carregar a auditoria."));
      return;
    }

    const page: AuditPage = await response.json();
    startTransition(() => {
      setData(page);
      // Cursor: a página seguinte soma à lista; filtro novo recomeça.
      setEntries((current) => (cursor ? [...current, ...page.entries] : page.entries));
    });
  }, []);

  // Busca instantânea com folga para digitação — sem isso, cada tecla vira consulta.
  useEffect(() => {
    if (filters === applied) return;
    const timer = setTimeout(() => {
      setApplied(filters);
      void load(filters);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters, applied, load]);

  function exportAs(format: "csv" | "xlsx") {
    const params = buildParams(applied);
    params.set("format", format);
    window.location.href = `/api/admin/audit/export?${params}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Acessos, alterações de credenciais e ações administrativas de toda a plataforma. A
          trilha é somente acréscimo — não há edição nem exclusão, aqui ou em qualquer outro
          lugar do sistema. Dados de investimento não aparecem neste painel.
        </p>
      </div>

      {canVerifyIntegrity && <IntegrityPanel />}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-64 space-y-2">
            <Label htmlFor="search">Usuário ou e-mail</Label>
            <Input
              id="search"
              placeholder="nome@exemplo.com"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </div>

          <div className="w-44 space-y-2">
            <Label>Categoria</Label>
            <Select
              value={filters.category}
              onValueChange={(value) => setFilters({ ...filters, category: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {Object.entries(AUDIT_CATEGORIES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-36 space-y-2">
            <Label>Resultado</Label>
            <Select
              value={filters.result}
              onValueChange={(value) => setFilters({ ...filters, result: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="SUCCESS">Sucesso</SelectItem>
                <SelectItem value="FAILED">Falha</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-40 space-y-2">
            <Label htmlFor="from">De</Label>
            <Input
              id="from"
              type="date"
              value={filters.from}
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
            />
          </div>

          <div className="w-40 space-y-2">
            <Label htmlFor="to">Até</Label>
            <Input
              id="to"
              type="date"
              value={filters.to}
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
            />
          </div>

          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => exportAs("csv")}>
              <Download />
              CSV
            </Button>
            <Button variant="outline" onClick={() => exportAs("xlsx")}>
              <FileSpreadsheet />
              Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Quando</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Usuário afetado</TableHead>
                <TableHead>Executado por</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && entries.length === 0 ? (
                Array.from({ length: 8 }, (_, index) => `skeleton-${index}`).map((key) => (
                  <TableRow key={key}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum evento com os filtros escolhidos.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        {entry.category === "ADMIN" && (
                          <ShieldAlert className="size-3.5 shrink-0 text-warning" />
                        )}
                        {entry.label}
                      </span>
                      {entry.reason && (
                        <span className="block max-w-md text-xs text-muted-foreground">
                          Motivo: {entry.reason}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="block">{entry.targetName ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.targetEmail ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.selfService ? (
                        <span className="text-muted-foreground">o próprio usuário</span>
                      ) : (
                        (entry.actorEmail ?? <span className="text-muted-foreground">sistema</span>)
                      )}
                    </TableCell>
                    <TableCell>
                      <ResultBadge entry={entry} />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {entry.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {entries.length} de {data.total.toLocaleString("pt-BR")} eventos
        </span>
        {data.nextCursor && (
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => load(applied, data.nextCursor)}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            Carregar mais
          </Button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Search, ShieldAlert } from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { toCsv } from "@/utils/audit-mapper";
import { AUDIT_CATEGORIES, type AuditCategory } from "@/constants/audit";
import type { AuditEntry, AuditPage } from "@/types/audit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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

function ResultBadge({ entry }: { entry: AuditEntry }) {
  if (entry.success === null) return <Badge variant="secondary">registro</Badge>;
  if (entry.success) return <Badge variant="success">sucesso</Badge>;
  return <Badge variant="destructive">falha</Badge>;
}

export function AuditView({ initial }: { initial: AuditPage }) {
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);

    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search.trim()) params.set("search", search.trim());
    if (category !== ALL) params.set("category", category);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());

    const response = await fetch(`/api/admin/audit?${params}`);
    setIsLoading(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível carregar a auditoria."));
      return;
    }

    setData(await response.json());
  }, [page, search, category, from, to]);

  // Recarrega ao mudar de página; filtros disparam pelo botão, para não bater no servidor
  // a cada tecla digitada na busca.
  useEffect(() => {
    if (page !== 1 || data !== initial) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters() {
    if (page === 1) void load();
    else setPage(1);
  }

  function exportCsv() {
    const blob = new Blob([toCsv(data.entries)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auditoria-pagina-${data.page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Acessos, alterações de senha, 2FA e ações administrativas de toda a plataforma.
          Dados de investimento dos usuários não aparecem aqui — nem em nenhuma outra tela
          deste painel.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-64 space-y-2">
            <Label htmlFor="search">Usuário ou e-mail</Label>
            <Input
              id="search"
              placeholder="nome@exemplo.com"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && applyFilters()}
            />
          </div>

          <div className="w-48 space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
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

          <div className="w-40 space-y-2">
            <Label htmlFor="from">De</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div className="w-40 space-y-2">
            <Label htmlFor="to">Até</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <Button onClick={applyFilters} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
            Filtrar
          </Button>

          <Button variant="outline" onClick={exportCsv} disabled={data.entries.length === 0}>
            <Download />
            CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum evento no período ou com os filtros escolhidos.
                  </TableCell>
                </TableRow>
              ) : (
                data.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {new Date(entry.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        {entry.category === "ADMIN" && (
                          <ShieldAlert className="size-3.5 text-warning" />
                        )}
                        {entry.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {AUDIT_CATEGORIES[entry.category as AuditCategory]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block">{entry.userName ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">{entry.userEmail ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <ResultBadge entry={entry} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{entry.reason ?? "—"}</TableCell>
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
          {data.total} eventos · página {data.page} de {lastPage}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1 || isLoading}
            onClick={() => setPage((current) => current - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= lastPage || isLoading}
            onClick={() => setPage((current) => current + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

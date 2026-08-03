"use client";

import { useCallback, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, FileText, Loader2, RefreshCw, Search } from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { formatBytes } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { AppLogEntry, AppLogLevel, AppLogPage } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const LEVELS: { value: AppLogLevel; label: string; badge: "destructive" | "warning" | "secondary" | "outline" }[] = [
  { value: "error", label: "Erro", badge: "destructive" },
  { value: "warn", label: "Aviso", badge: "warning" },
  { value: "info", label: "Informação", badge: "secondary" },
  { value: "debug", label: "Depuração", badge: "outline" },
];

const BADGE_OF: Record<AppLogLevel, "destructive" | "warning" | "secondary" | "outline"> =
  Object.fromEntries(LEVELS.map((level) => [level.value, level.badge])) as never;

export function LogsView({ initial }: { initial: AppLogPage }) {
  const [data, setData] = useState(initial);
  const [levels, setLevels] = useState<AppLogLevel[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(
    async (page = 1, overrides?: { levels?: AppLogLevel[]; search?: string }) => {
      setIsLoading(true);

      const params = new URLSearchParams({ page: String(page), pageSize: String(data.pageSize) });
      const nextLevels = overrides?.levels ?? levels;
      const nextSearch = overrides?.search ?? search;

      if (nextLevels.length > 0) params.set("levels", nextLevels.join(","));
      if (nextSearch.trim()) params.set("search", nextSearch.trim());

      const response = await fetch(`/api/admin/logs?${params}`);
      setIsLoading(false);

      if (!response.ok) {
        toast.error(await extractApiError(response, "Não foi possível ler o log."));
        return;
      }

      setData(await response.json());
    },
    [data.pageSize, levels, search],
  );

  function toggleLevel(level: AppLogLevel) {
    const next = levels.includes(level)
      ? levels.filter((item) => item !== level)
      : [...levels, level];

    setLevels(next);
    void load(1, { levels: next });
  }

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
          <p className="text-sm text-muted-foreground">
            O que a aplicação registrou. Sobrevive à recriação do container; o{" "}
            <code className="rounded bg-muted px-1">docker compose logs</code> continua
            mostrando o mesmo, e mais os outros containers.
          </p>
        </div>

        <Button variant="outline" onClick={() => load(data.page)} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="w-72 space-y-2">
            <Label htmlFor="log-search">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="log-search"
                className="pl-8"
                placeholder="Mensagem ou qualquer campo do contexto"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && load(1)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nível</Label>
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map((level) => (
                <Button
                  key={level.value}
                  variant={levels.includes(level.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleLevel(level.value)}
                >
                  {level.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {data.sizeBytes === null && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex gap-3 p-4">
            <FileText className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-sm text-muted-foreground">
              Nenhum arquivo de log encontrado. Ou o volume não está montado, ou a pasta não
              tem permissão de escrita para o usuário da aplicação (uid 1001). Enquanto isso,
              o log continua saindo em <code className="rounded bg-muted px-1">docker compose logs app</code>.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-1 p-3">
          {data.entries.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma linha para estes filtros.
            </p>
          ) : (
            data.entries.map((entry) => <LogRow key={entry.id} entry={entry} />)
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {data.total.toLocaleString("pt-BR")} linha(s)
          {data.truncated && " na janela lida — há histórico mais antigo além dela"}
          {data.sizeBytes !== null && ` · arquivo com ${formatBytes(data.sizeBytes)}`}
        </span>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1 || isLoading}
            onClick={() => load(data.page - 1)}
          >
            Anterior
          </Button>
          <span className="tabular-nums">
            {data.page} / {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= lastPage || isLoading}
            onClick={() => load(data.page + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

/** O contexto só abre quando pedido: é ele que faz uma linha ocupar meia tela. */
function LogRow({ entry }: { entry: AppLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasContext = Object.keys(entry.context).length > 0;

  return (
    <div className="rounded-lg border p-3">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        disabled={!hasContext}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="whitespace-nowrap pt-0.5 text-xs tabular-nums text-muted-foreground">
          {format(new Date(entry.timestamp), "dd/MM HH:mm:ss")}
        </span>
        <Badge variant={BADGE_OF[entry.level]}>{entry.level}</Badge>
        <span className="flex-1 text-sm">{entry.message}</span>
        {hasContext && (
          <ChevronDown
            className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        )}
      </button>

      {open && hasContext && (
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">
          {JSON.stringify(entry.context, null, 2)}
        </pre>
      )}
    </div>
  );
}

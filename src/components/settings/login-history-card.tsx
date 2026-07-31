import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccountOverview } from "@/services/account.service";

/** Reduz o user agent a algo legível ("Chrome · Windows") sem virar fingerprint. */
function summarizeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "—";

  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : "Navegador";

  const os =
    /Windows/.test(userAgent) ? "Windows"
    : /Mac OS/.test(userAgent) ? "macOS"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "";

  return os ? `${browser} · ${os}` : browser;
}

export function LoginHistoryCard({ history }: { history: AccountOverview["loginHistory"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de acessos</CardTitle>
        <CardDescription>
          Últimas tentativas de login na sua conta. Algo estranho aqui? Troque sua senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {history.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Dispositivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {format(new Date(entry.createdAt), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.success ? "success" : "destructive"}>
                      {entry.success ? "Sucesso" : "Falha"}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {entry.ipAddress ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {summarizeUserAgent(entry.userAgent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Loader2, LogOut, MonitorSmartphone, ShieldCheck, XCircle } from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { ROLE_LABELS } from "@/lib/permissions";
import type { AdminUserDetail } from "@/types/audit";
import { StepUpDialog } from "@/components/admin/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const REASON_MIN_LENGTH = 10;

type PendingAction =
  | { kind: "REVOKE_SESSION"; sessionId: string; device: string }
  | { kind: "FORCE_LOGOUT" };

function moment(iso: string): string {
  return format(new Date(iso), "dd/MM/yyyy HH:mm");
}

export function UserDetailView({
  detail,
  currentAdminId,
  adminTwoFactorEnabled,
}: {
  detail: AdminUserDetail;
  currentAdminId: string;
  adminTwoFactorEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsStepUp, setNeedsStepUp] = useState(false);

  const { user, sessions, logins, events } = detail;
  const isSelf = user.id === currentAdminId;
  const activeSessions = sessions.filter((session) => session.active);

  function open(action: PendingAction) {
    setPending(action);
    setReason("");
  }

  function close() {
    setPending(null);
    setReason("");
  }

  /** Mesmo rito da tela de usuários: 428 abre a confirmação de senha e reenvia depois. */
  async function confirm() {
    if (!pending) return;
    setIsSubmitting(true);

    const body =
      pending.kind === "REVOKE_SESSION"
        ? { action: "REVOKE_SESSION", sessionId: pending.sessionId, reason: reason.trim() }
        : { action: "FORCE_LOGOUT", reason: reason.trim() };

    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setIsSubmitting(false);

    if (response.status === 428) {
      setNeedsStepUp(true);
      return;
    }

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível concluir a ação."));
      return;
    }

    toast.success("Acesso encerrado. O usuário foi avisado por e-mail.");
    close();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para usuários
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">{user.name ?? "Sem nome"}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
          <Badge variant={user.emailVerified ? "success" : "warning"}>
            {user.emailVerified ? "E-mail confirmado" : "E-mail não confirmado"}
          </Badge>
          <Badge variant={user.twoFactorEnabled ? "success" : "secondary"}>
            {user.twoFactorEnabled ? "2FA ativo" : "Sem 2FA"}
          </Badge>
          {user.lockedUntil && <Badge variant="destructive">Bloqueada</Badge>}
          {isSelf && <Badge variant="default">Você</Badge>}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Conta criada em" value={moment(user.createdAt)} />
          <Fact label="Último acesso" value={user.lastLoginAt ? moment(user.lastLoginAt) : "Nunca"} />
          <Fact label="Sessões ativas" value={String(user.activeSessions)} />
          <Fact label="Tentativas falhas" value={String(user.failedLoginAttempts)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorSmartphone className="size-4" />
              Sessões
            </CardTitle>
            <CardDescription>
              Onde a conta está conectada. Encerrar corta o acesso na hora, e o usuário é
              avisado por e-mail.
            </CardDescription>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={activeSessions.length === 0}
            onClick={() => open({ kind: "FORCE_LOGOUT" })}
          >
            <LogOut className="size-4" />
            Encerrar todas
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Última atividade</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma sessão registrada.
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.device}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {session.ipAddress ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {moment(session.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {moment(session.lastSeenAt)}
                    </TableCell>
                    <TableCell>
                      {session.active ? (
                        <Badge variant="success">Ativa</Badge>
                      ) : session.revokedAt ? (
                        <Badge variant="secondary" title={session.revocationReason ?? undefined}>
                          Encerrada
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Expirada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {session.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            open({
                              kind: "REVOKE_SESSION",
                              sessionId: session.id,
                              device: session.device,
                            })
                          }
                        >
                          <XCircle className="size-4" />
                          Encerrar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Tentativas de acesso
          </CardTitle>
          <CardDescription>Últimos 20 logins, incluindo os que falharam.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
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
              {logins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma tentativa registrada.
                  </TableCell>
                </TableRow>
              ) : (
                logins.map((login) => (
                  <TableRow key={login.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {moment(login.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={login.success ? "success" : "destructive"}>
                        {login.success ? "Sucesso" : "Falha"}
                      </Badge>
                      {login.reason && (
                        <span className="ml-2 text-xs text-muted-foreground">{login.reason}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {login.ipAddress ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{login.device}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico da conta</CardTitle>
          <CardDescription>
            Eventos da trilha de auditoria que citam esta conta — como alvo ou como autora.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum evento registrado.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {moment(event.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className={event.result === "FAILED" ? "text-destructive" : undefined}>
                        {event.description}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{event.reason ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={pending !== null && !needsStepUp} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {pending.kind === "FORCE_LOGOUT" ? "Encerrar todas as sessões" : "Encerrar sessão"}
                </DialogTitle>
                <DialogDescription>
                  {pending.kind === "FORCE_LOGOUT" ? (
                    <>
                      {activeSessions.length} acesso(s) de {user.email} serão encerrados, e os
                      tokens já emitidos deixam de valer — o usuário precisará entrar de novo em
                      todos os dispositivos.
                      {isSelf && " Sua sessão atual é preservada."}
                    </>
                  ) : (
                    <>O acesso de {pending.device} será cortado imediatamente.</>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="revoke-reason">Motivo</Label>
                <Textarea
                  id="revoke-reason"
                  rows={3}
                  placeholder="Ex: chamado #518 — usuário relatou acesso que não reconhece."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Fica na trilha de auditoria junto com seu nome, IP e horário. Mínimo de{" "}
                  {REASON_MIN_LENGTH} caracteres.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={close}>
                  Cancelar
                </Button>
                <Button
                  onClick={confirm}
                  disabled={isSubmitting || reason.trim().length < REASON_MIN_LENGTH}
                >
                  {isSubmitting && <Loader2 className="animate-spin" />}
                  Encerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <StepUpDialog
        open={needsStepUp}
        onOpenChange={setNeedsStepUp}
        twoFactorEnabled={adminTwoFactorEnabled}
        onConfirmed={confirm}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  KeyRound,
  Loader2,
  LockOpen,
  Mail,
  Search,
  ShieldOff,
  ShieldPlus,
  UserPen,
} from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import type { AdminUserPage, AdminUserRow } from "@/types/audit";
import { hasAdminAccess, ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { StepUpDialog } from "@/components/admin/step-up-dialog";
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

type Action =
  | "RENAME"
  | "CHANGE_EMAIL"
  | "SEND_PASSWORD_RESET"
  | "RESET_TWO_FACTOR"
  | "UNLOCK"
  | "SET_ROLE";

interface PendingAction {
  user: AdminUserRow;
  action: Action;
}

/**
 * Ações que a API recusa sem justificativa escrita.
 *
 * Espelha o schema da rota — lá a exigência é validada, aqui ela é pedida. Renomear fica de
 * fora: é a única alteração cosmética da lista, e exigir motivo para tudo transforma a
 * justificativa em formalidade preenchida com "ok".
 */
const REQUIRES_REASON = new Set<Action>([
  "CHANGE_EMAIL",
  "SEND_PASSWORD_RESET",
  "RESET_TWO_FACTOR",
  "UNLOCK",
  "SET_ROLE",
]);

const REASON_MIN_LENGTH = 10;

/** Ordem do menos para o mais poderoso — a lista é lida de cima para baixo. */
const ROLE_OPTIONS: Role[] = ["USER", "READ_ONLY", "AUDITOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"];

const ACTION_COPY: Record<Action, { title: string; description: string; confirm: string }> = {
  RENAME: {
    title: "Alterar nome",
    description: "O usuário recebe um e-mail informando a alteração.",
    confirm: "Salvar nome",
  },
  CHANGE_EMAIL: {
    title: "Alterar e-mail",
    description:
      "O endereço novo entra como não confirmado e recebe um link de verificação. O endereço antigo é avisado da troca. Enquanto não confirmar, o usuário não consegue entrar.",
    confirm: "Alterar e-mail",
  },
  SEND_PASSWORD_RESET: {
    title: "Enviar link de redefinição",
    description:
      "O usuário recebe um link válido por 1 hora e escolhe a nova senha. Você não tem acesso à senha em momento nenhum.",
    confirm: "Enviar link",
  },
  RESET_TWO_FACTOR: {
    title: "Resetar autenticação em duas etapas",
    description:
      "Remove o 2FA da conta — use apenas quando o usuário perdeu o aplicativo e os códigos de recuperação. A conta fica com um fator a menos até ele configurar de novo.",
    confirm: "Remover 2FA",
  },
  UNLOCK: {
    title: "Desbloquear conta",
    description: "Zera as tentativas falhas e libera o acesso imediatamente.",
    confirm: "Desbloquear",
  },
  SET_ROLE: {
    title: "Alterar cargo",
    description:
      "O que cada cargo alcança está em Cargos. Nenhum deles enxerga carteira de usuário. A mudança vale na hora para as rotas, e a partir do próximo login para o menu.",
    confirm: "Alterar cargo",
  },
};

export function UsersView({
  initial,
  currentAdminId,
  adminTwoFactorEnabled,
  canManageRoles,
}: {
  initial: AdminUserPage;
  currentAdminId: string;
  /** Do próprio administrador: decide se a confirmação pede o código do app. */
  adminTwoFactorEnabled: boolean;
  /** `MANAGE_ROLES`: sem ela o botão de cargo não aparece, e a rota recusa de qualquer forma. */
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsStepUp, setNeedsStepUp] = useState(false);

  async function load(page = 1) {
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(data.pageSize) });
    if (search.trim()) params.set("search", search.trim());

    const response = await fetch(`/api/admin/users?${params}`);
    setIsLoading(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível carregar os usuários."));
      return;
    }
    setData(await response.json());
  }

  function openAction(user: AdminUserRow, action: Action) {
    setPending({ user, action });
    // O cargo abre já no atual: a troca é uma escolha entre seis, não um campo em branco.
    setInputValue(action === "RENAME" ? (user.name ?? "") : action === "SET_ROLE" ? user.role : "");
    setReason("");
  }

  function closeAction() {
    setPending(null);
    setReason("");
    setInputValue("");
  }

  /**
   * Envia a ação. O 428 não é erro para o usuário: é o servidor dizendo que a confirmação de
   * identidade expirou. A tela abre o diálogo de senha e, aceita a confirmação, reenvia esta
   * mesma ação — a justificativa digitada continua no estado, então nada é perdido.
   */
  async function confirmAction() {
    if (!pending) return;
    setIsSubmitting(true);

    const body: Record<string, unknown> = { action: pending.action };
    if (pending.action === "RENAME") body.name = inputValue;
    if (pending.action === "CHANGE_EMAIL") body.email = inputValue;
    if (pending.action === "SET_ROLE") body.role = inputValue;
    if (REQUIRES_REASON.has(pending.action)) body.reason = reason.trim();

    const response = await fetch(`/api/admin/users/${pending.user.id}`, {
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

    toast.success("Ação registrada. O usuário foi avisado por e-mail.");
    closeAction();
    await load(data.page);
    router.refresh();
  }

  const justificativaOk =
    pending === null ||
    !REQUIRES_REASON.has(pending.action) ||
    reason.trim().length >= REASON_MIN_LENGTH;

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Identidade, acesso e segurança das contas. Dados de investimento não são exibidos
          aqui e não podem ser consultados pelo painel.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-72 space-y-2">
            <Label htmlFor="search">Nome ou e-mail</Label>
            <Input
              id="search"
              placeholder="Buscar usuário"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && load(1)}
            />
          </div>
          <Button onClick={() => load(1)} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
            Buscar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    {/* O nome leva ao detalhe: sessões, acessos e histórico da conta. */}
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {user.name ?? "—"}
                    </Link>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    {user.activeSessions > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {user.activeSessions} sessão(ões) ativa(s)
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="space-x-1">
                    {hasAdminAccess(user) && <Badge variant="warning">{user.role.toLowerCase()}</Badge>}
                    {!user.emailVerified && (
                      <Badge variant="secondary">
                        {user.expiresInHours === null
                          ? "e-mail não confirmado"
                          : `expira em ${user.expiresInHours}h`}
                      </Badge>
                    )}
                    {user.twoFactorEnabled && <Badge variant="success">2FA</Badge>}
                    {user.lockedUntil && <Badge variant="destructive">bloqueada</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("pt-BR") : "nunca"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button variant="ghost" size="sm" title="Alterar nome" onClick={() => openAction(user, "RENAME")}>
                      <UserPen className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Alterar e-mail" onClick={() => openAction(user, "CHANGE_EMAIL")}>
                      <Mail className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Enviar link de redefinição" onClick={() => openAction(user, "SEND_PASSWORD_RESET")}>
                      <KeyRound className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Resetar 2FA" disabled={!user.twoFactorEnabled} onClick={() => openAction(user, "RESET_TWO_FACTOR")}>
                      <ShieldOff className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Desbloquear conta" disabled={!user.lockedUntil} onClick={() => openAction(user, "UNLOCK")}>
                      <LockOpen className="size-4" />
                    </Button>
                    {canManageRoles && (
                      <Button
                        variant="ghost"
                        size="sm"
                        // Sobre si mesmo o cargo não muda por aqui: o único dono se trancaria
                        // para fora do painel sem caminho de volta pela interface.
                        disabled={user.id === currentAdminId}
                        title={
                          user.id === currentAdminId
                            ? "Você não pode alterar o seu próprio cargo"
                            : "Alterar cargo"
                        }
                        onClick={() => openAction(user, "SET_ROLE")}
                      >
                        <ShieldPlus className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data.total} usuários · página {data.page} de {lastPage}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={data.page <= 1 || isLoading} onClick={() => load(data.page - 1)}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" disabled={data.page >= lastPage || isLoading} onClick={() => load(data.page + 1)}>
            Próxima
          </Button>
        </div>
      </div>

      {/* Enquanto a senha é pedida, este diálogo sai da tela sem perder o que foi digitado:
          `pending` continua de pé e a ação é reenviada assim que a confirmação for aceita. */}
      <Dialog
        open={pending !== null && !needsStepUp}
        onOpenChange={(open) => !open && closeAction()}
      >
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_COPY[pending.action].title}</DialogTitle>
                <DialogDescription>
                  {pending.user.name ?? pending.user.email} · {ACTION_COPY[pending.action].description}
                </DialogDescription>
              </DialogHeader>

              {(pending.action === "RENAME" || pending.action === "CHANGE_EMAIL") && (
                <div className="space-y-2">
                  <Label htmlFor="action-input">
                    {pending.action === "RENAME" ? "Novo nome" : "Novo e-mail"}
                  </Label>
                  <Input
                    id="action-input"
                    type={pending.action === "CHANGE_EMAIL" ? "email" : "text"}
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                  />
                </div>
              )}

              {pending.action === "SET_ROLE" && (
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  {/* O `select` nativo desenha a lista pelo navegador, que ignora o tema —
                      no escuro saía fundo branco com texto claro, ilegível. */}
                  <Select value={inputValue} onValueChange={setInputValue}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {ROLE_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Cargo atual: {ROLE_LABELS[pending.user.role]}.
                  </p>
                </div>
              )}

              {REQUIRES_REASON.has(pending.action) && (
                <div className="space-y-2">
                  <Label htmlFor="action-reason">Motivo</Label>
                  <Textarea
                    id="action-reason"
                    rows={3}
                    placeholder="Ex: chamado #412 — usuário perdeu o celular e os códigos de recuperação."
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Fica na trilha de auditoria junto com seu nome, IP e horário. Mínimo de{" "}
                    {REASON_MIN_LENGTH} caracteres.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeAction}>
                  Cancelar
                </Button>
                <Button onClick={confirmAction} disabled={isSubmitting || !justificativaOk}>
                  {isSubmitting && <Loader2 className="animate-spin" />}
                  {ACTION_COPY[pending.action].confirm}
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
        onConfirmed={confirmAction}
      />
    </div>
  );
}

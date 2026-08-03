import type { Role } from "@prisma/client";
import { isPrivilegedRole } from "@/lib/permissions";

/**
 * Regras de quem pode agir sobre quem no painel administrativo — puro, sem I/O.
 *
 * A separação em função pura existe para estas regras poderem ser testadas e lidas sem
 * subir banco: elas são a diferença entre "administrador dá suporte" e "administrador
 * assume a conta alheia".
 */

export type AdminAction =
  | "RENAME"
  | "CHANGE_EMAIL"
  | "SEND_PASSWORD_RESET"
  | "RESET_TWO_FACTOR"
  | "UNLOCK"
  | "GRANT_ADMIN"
  | "REVOKE_ADMIN"
  | "REVOKE_SESSION"
  | "FORCE_LOGOUT";

/**
 * Conta com algum poder administrativo.
 *
 * Não compara papéis: pergunta ao mapa de permissões. Cargo novo com acesso ao painel
 * passa a ser protegido por esta regra sem ninguém lembrar de vir aqui.
 */
const isPrivileged = isPrivilegedRole;

/** Ações que mexem no papel, e não nos dados da conta. */
const ROLE_ACTIONS: AdminAction[] = ["GRANT_ADMIN", "REVOKE_ADMIN"];

export interface ActorTarget {
  actorId: string;
  targetId: string;
  targetRole: Role;
}

export interface PolicyResult {
  allowed: boolean;
  /** Código estável para a API responder e para a tela explicar a recusa. */
  reason?: "SELF_TARGET" | "ADMIN_TARGET" | "SELF_ROLE_CHANGE";
}

/**
 * Decide se a ação é permitida — **quem pode agir sobre quem**, nunca "faz sentido agir".
 *
 * Três proibições, todas sobre escalada de privilégio:
 *
 *  - **conta de outro administrador é intocável.** Resetar o 2FA ou trocar o e-mail de um
 *    par transformaria "administrar usuários" em "tomar o painel de quem também administra";
 *  - **sobre si mesmo, nada que mude identidade ou acesso.** Trocar o próprio e-mail ou
 *    zerar o próprio 2FA por aqui contorna as verificações que o fluxo normal de conta faz
 *    (senha atual, código do app) — e some do lugar onde o usuário esperaria ver isso;
 *  - **o próprio cargo não muda por aqui, em direção nenhuma.**
 *
 * Nome e desbloqueio ficam liberados sobre si: um é cosmético, o outro devolve acesso sem
 * conceder poder nenhum. Encerrar sessão também: derrubar o próprio acesso não escala
 * privilégio nenhum, e é o que alguém faz ao perceber que perdeu o notebook.
 *
 * **"Já está nessa situação" não mora aqui.** Esta função só conhece o cargo atual do alvo;
 * comparar com o cargo pretendido é do serviço, que conhece os dois. A versão anterior
 * tentava adivinhar pela distinção entre conceder e remover, e o resultado foi recusar toda
 * troca entre dois cargos administrativos — de somente-leitura para suporte, por exemplo —
 * com a mensagem errada.
 */
export function canPerform(action: AdminAction, context: ActorTarget): PolicyResult {
  const isSelf = context.actorId === context.targetId;
  const isRoleAction = ROLE_ACTIONS.includes(action);

  // O próprio cargo não muda por aqui, em direção nenhuma. Rebaixar-se tiraria o acesso de
  // quem talvez seja o único a tê-lo, sem caminho de volta pela interface; promover-se
  // dispensaria a decisão de outra pessoa, que é justamente o ponto de haver a regra.
  if (isSelf && isRoleAction) {
    return { allowed: false, reason: "SELF_ROLE_CHANGE" };
  }

  // Conta de outro administrador é intocável **nos dados** — trocar e-mail ou zerar 2FA de
  // um par seria tomar o painel de quem também administra. Mexer no cargo continua
  // permitido: é como se corrige uma permissão dada por engano.
  if (!isSelf && isPrivileged(context.targetRole) && !isRoleAction) {
    return { allowed: false, reason: "ADMIN_TARGET" };
  }

  if (isSelf && (action === "CHANGE_EMAIL" || action === "RESET_TWO_FACTOR")) {
    return { allowed: false, reason: "SELF_TARGET" };
  }

  return { allowed: true };
}

export const POLICY_MESSAGES: Record<NonNullable<PolicyResult["reason"]>, string> = {
  ADMIN_TARGET: "Contas de administrador não podem ser alteradas por outro administrador.",
  SELF_TARGET: "Use as configurações da sua própria conta para esta alteração.",
  SELF_ROLE_CHANGE: "Você não pode alterar o seu próprio cargo. Peça a quem gerencia cargos.",
};

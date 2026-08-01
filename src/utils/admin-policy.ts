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
  | "UNLOCK";

export interface ActorTarget {
  actorId: string;
  targetId: string;
  targetRole: "USER" | "ADMIN";
}

export interface PolicyResult {
  allowed: boolean;
  /** Código estável para a API responder e para a tela explicar a recusa. */
  reason?: "SELF_TARGET" | "ADMIN_TARGET";
}

/**
 * Decide se a ação é permitida.
 *
 * Duas proibições, ambas sobre escalada de privilégio:
 *
 *  - **conta de outro administrador é intocável.** Resetar o 2FA ou trocar o e-mail de um
 *    par transformaria "administrar usuários" em "tomar o painel de quem também administra";
 *  - **sobre si mesmo, nada que mude identidade ou acesso.** Trocar o próprio e-mail ou
 *    zerar o próprio 2FA por aqui contorna as verificações que o fluxo normal de conta faz
 *    (senha atual, código do app) — e some do lugar onde o usuário esperaria ver isso.
 *
 * Nome e desbloqueio ficam liberados sobre si: um é cosmético, o outro devolve acesso sem
 * conceder poder nenhum.
 */
export function canPerform(action: AdminAction, context: ActorTarget): PolicyResult {
  const isSelf = context.actorId === context.targetId;

  if (!isSelf && context.targetRole === "ADMIN") {
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
};

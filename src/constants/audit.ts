/**
 * Catálogo de eventos auditáveis.
 *
 * Existir como constante — e não como string solta em cada chamada — evita o problema
 * clássico da trilha: dois pontos do código gravando `PASSWORD_RESET` e
 * `PASSWORD_RESET_COMPLETED` para a mesma coisa, e a busca por evento não achando metade
 * dos casos.
 *
 * Nunca coloque credencial, token ou código 2FA no `metadata`: a trilha é lida por
 * administradores e exportada em CSV e Excel — um segredo aqui vazaria com ela.
 */

export const AUDIT_ACTIONS = {
  // Acesso
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  SESSION_REVOKED: "SESSION_REVOKED",

  // Conta
  USER_REGISTERED: "USER_REGISTERED",
  REGISTER_ATTEMPT_DUPLICATE: "REGISTER_ATTEMPT_DUPLICATE",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  EMAIL_CHANGED: "EMAIL_CHANGED",
  NAME_CHANGED: "NAME_CHANGED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_UNLOCKED: "ACCOUNT_UNLOCKED",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  ACCOUNT_REMOVED_UNVERIFIED: "ACCOUNT_REMOVED_UNVERIFIED",

  // Senha
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",

  // Dois fatores
  TWO_FACTOR_ENABLED: "TWO_FACTOR_ENABLED",
  TWO_FACTOR_DISABLED: "TWO_FACTOR_DISABLED",
  TWO_FACTOR_RESET_BY_ADMIN: "TWO_FACTOR_RESET_BY_ADMIN",

  // Administração — autor em `actorId`, alvo em `userId`.
  ADMIN_USER_RENAMED: "ADMIN_USER_RENAMED",
  ADMIN_USER_EMAIL_CHANGED: "ADMIN_USER_EMAIL_CHANGED",
  ADMIN_PASSWORD_RESET_SENT: "ADMIN_PASSWORD_RESET_SENT",
  ADMIN_ACCOUNT_UNLOCKED: "ADMIN_ACCOUNT_UNLOCKED",
  ADMIN_SESSIONS_REVOKED: "ADMIN_SESSIONS_REVOKED",
  ADMIN_BACKUP_DOWNLOADED: "ADMIN_BACKUP_DOWNLOADED",
  ADMIN_BACKUP_CREATED: "ADMIN_BACKUP_CREATED",
  ADMIN_BACKUP_RESTORED: "ADMIN_BACKUP_RESTORED",
  /** Ensaio: o backup foi carregado num banco temporário e conferido, sem tocar a produção. */
  ADMIN_BACKUP_DRILL: "ADMIN_BACKUP_DRILL",
  ADMIN_ACCESS_DENIED: "ADMIN_ACCESS_DENIED",
  ADMIN_ROLE_GRANTED: "ADMIN_ROLE_GRANTED",
  ADMIN_ROLE_REVOKED: "ADMIN_ROLE_REVOKED",
  ADMIN_STEP_UP_FAILED: "ADMIN_STEP_UP_FAILED",
  AUDIT_INTEGRITY_VERIFIED: "AUDIT_INTEGRITY_VERIFIED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Eventos de segurança: se o log não gravar, a operação é abortada.
 *
 * A regra vem de uma constatação simples — perder o registro de um login ou de uma troca de
 * senha é perder exatamente a evidência que a auditoria existe para guardar. Já um erro ao
 * registrar mudança de tema não justifica derrubar a experiência do usuário: ali o erro vai
 * para os logs da aplicação e o fluxo segue.
 */
export const SECURITY_CRITICAL_ACTIONS = new Set<string>([
  AUDIT_ACTIONS.LOGIN_SUCCESS,
  AUDIT_ACTIONS.LOGIN_FAILED,
  AUDIT_ACTIONS.LOGOUT,
  AUDIT_ACTIONS.SESSION_REVOKED,
  AUDIT_ACTIONS.PASSWORD_CHANGED,
  AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
  AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
  AUDIT_ACTIONS.EMAIL_CHANGED,
  AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
  AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
  AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN,
  AUDIT_ACTIONS.ACCOUNT_LOCKED,
  AUDIT_ACTIONS.ACCOUNT_UNLOCKED,
  AUDIT_ACTIONS.ACCOUNT_DELETED,
  AUDIT_ACTIONS.ADMIN_ROLE_GRANTED,
  AUDIT_ACTIONS.ADMIN_ROLE_REVOKED,
  AUDIT_ACTIONS.ADMIN_USER_EMAIL_CHANGED,
  AUDIT_ACTIONS.ADMIN_PASSWORD_RESET_SENT,
  AUDIT_ACTIONS.ADMIN_BACKUP_RESTORED,
  AUDIT_ACTIONS.ADMIN_BACKUP_DRILL,
]);

/**
 * Ações que exigem justificativa escrita e confirmação de identidade do administrador.
 * São as que afetam a conta de outra pessoa ou a plataforma inteira.
 */
export const ACTIONS_REQUIRING_REASON = new Set<string>([
  AUDIT_ACTIONS.ADMIN_USER_EMAIL_CHANGED,
  AUDIT_ACTIONS.ADMIN_PASSWORD_RESET_SENT,
  AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN,
  AUDIT_ACTIONS.ADMIN_ROLE_GRANTED,
  AUDIT_ACTIONS.ADMIN_ROLE_REVOKED,
  AUDIT_ACTIONS.ADMIN_ACCOUNT_UNLOCKED,
  AUDIT_ACTIONS.ADMIN_SESSIONS_REVOKED,
  AUDIT_ACTIONS.ADMIN_BACKUP_RESTORED,
  // O ensaio não toca a produção, mas cria uma cópia completa da base num banco temporário.
  // A janela é curta e o banco é apagado ao fim; ainda assim, quem a abriu fica registrado.
  AUDIT_ACTIONS.ADMIN_BACKUP_DRILL,
]);

export function isSecurityCritical(action: string): boolean {
  return SECURITY_CRITICAL_ACTIONS.has(action);
}

export function requiresReason(action: string): boolean {
  return ACTIONS_REQUIRING_REASON.has(action);
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: "Login realizado",
  LOGIN_FAILED: "Tentativa de login falhou",
  LOGOUT: "Logout",
  SESSION_REVOKED: "Sessão encerrada",
  USER_REGISTERED: "Cadastro criado",
  REGISTER_ATTEMPT_DUPLICATE: "Tentativa de cadastro com e-mail existente",
  EMAIL_VERIFIED: "E-mail confirmado",
  EMAIL_CHANGED: "E-mail alterado",
  NAME_CHANGED: "Nome alterado",
  PROFILE_UPDATED: "Perfil atualizado",
  ACCOUNT_LOCKED: "Conta bloqueada por tentativas",
  ACCOUNT_UNLOCKED: "Conta desbloqueada",
  ACCOUNT_DELETED: "Conta excluída",
  ACCOUNT_REMOVED_UNVERIFIED: "Cadastro removido por falta de confirmação",
  PASSWORD_CHANGED: "Senha alterada",
  PASSWORD_RESET_REQUESTED: "Redefinição de senha solicitada",
  PASSWORD_RESET_COMPLETED: "Redefinição de senha concluída",
  TWO_FACTOR_ENABLED: "MFA ativado",
  TWO_FACTOR_DISABLED: "MFA desativado",
  TWO_FACTOR_RESET_BY_ADMIN: "MFA resetado pelo administrador",
  ADMIN_USER_RENAMED: "Nome alterado pelo administrador",
  ADMIN_USER_EMAIL_CHANGED: "E-mail alterado pelo administrador",
  ADMIN_PASSWORD_RESET_SENT: "Redefinição de senha enviada pelo administrador",
  ADMIN_ACCOUNT_UNLOCKED: "Conta desbloqueada pelo administrador",
  ADMIN_SESSIONS_REVOKED: "Sessões revogadas pelo administrador",
  ADMIN_BACKUP_DOWNLOADED: "Backup baixado",
  ADMIN_BACKUP_CREATED: "Backup gerado",
  ADMIN_BACKUP_RESTORED: "Backup restaurado",
  ADMIN_BACKUP_DRILL: "Ensaio de restauração de backup",
  ADMIN_ACCESS_DENIED: "Acesso administrativo negado",
  ADMIN_ROLE_GRANTED: "Cargo concedido",
  ADMIN_ROLE_REVOKED: "Cargo removido",
  ADMIN_STEP_UP_FAILED: "Confirmação de identidade falhou",
  AUDIT_INTEGRITY_VERIFIED: "Integridade da trilha verificada",
};

/** Motivos de falha de login, como gravados em `LoginAudit.reason`. */
export const LOGIN_FAILURE_LABELS: Record<string, string> = {
  USER_NOT_FOUND: "E-mail não cadastrado",
  WRONG_PASSWORD: "Senha incorreta",
  ACCOUNT_LOCKED: "Conta bloqueada",
  EMAIL_NOT_VERIFIED: "E-mail não confirmado",
  INVALID_TOTP: "Código MFA inválido",
  INVALID_RECOVERY_CODE: "Código de recuperação inválido",
};

export const AUDIT_CATEGORIES = {
  LOGIN: "Acessos",
  ACCOUNT: "Conta",
  PASSWORD: "Senha",
  TWO_FACTOR: "MFA",
  ADMIN: "Administração",
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

export function categoryOf(action: string): AuditCategory {
  if (action.startsWith("ADMIN_") || action.startsWith("AUDIT_")) return "ADMIN";
  if (action.startsWith("TWO_FACTOR")) return "TWO_FACTOR";
  if (action.startsWith("PASSWORD")) return "PASSWORD";
  if (action.startsWith("LOGIN") || action === "LOGOUT" || action === "SESSION_REVOKED") {
    return "LOGIN";
  }
  return "ACCOUNT";
}

/**
 * Catálogo de eventos auditáveis.
 *
 * Existir como constante — e não como string solta em cada `record()` — evita o problema
 * clássico da trilha de auditoria: dois pontos do código gravando `PASSWORD_RESET` e
 * `PASSWORD_RESET_COMPLETED` para a mesma coisa, e a busca por evento não achando metade
 * dos casos.
 *
 * Nunca coloque credencial, token ou código 2FA no `metadata`: a trilha é lida por
 * administradores e exportada em CSV, e um segredo aqui vazaria com ela.
 */
export const AUDIT_ACTIONS = {
  // Conta
  USER_REGISTERED: "USER_REGISTERED",
  REGISTER_ATTEMPT_DUPLICATE: "REGISTER_ATTEMPT_DUPLICATE",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  EMAIL_CHANGED: "EMAIL_CHANGED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",

  // Senha
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",

  // Dois fatores
  TWO_FACTOR_ENABLED: "TWO_FACTOR_ENABLED",
  TWO_FACTOR_DISABLED: "TWO_FACTOR_DISABLED",
  TWO_FACTOR_RESET_BY_ADMIN: "TWO_FACTOR_RESET_BY_ADMIN",

  // Ações administrativas — sempre com o admin em `userId` e o alvo em `entityId`.
  ADMIN_USER_RENAMED: "ADMIN_USER_RENAMED",
  ADMIN_USER_EMAIL_CHANGED: "ADMIN_USER_EMAIL_CHANGED",
  ADMIN_PASSWORD_RESET_SENT: "ADMIN_PASSWORD_RESET_SENT",
  ADMIN_ACCOUNT_UNLOCKED: "ADMIN_ACCOUNT_UNLOCKED",
  ADMIN_BACKUP_DOWNLOADED: "ADMIN_BACKUP_DOWNLOADED",
  ADMIN_BACKUP_CREATED: "ADMIN_BACKUP_CREATED",
  /** Tentativa de acessar área administrativa sem permissão — sinal de sondagem. */
  ADMIN_ACCESS_DENIED: "ADMIN_ACCESS_DENIED",
  ADMIN_ROLE_GRANTED: "ADMIN_ROLE_GRANTED",
  /** Cadastro removido por não confirmar o e-mail no prazo. */
  ACCOUNT_REMOVED_UNVERIFIED: "ACCOUNT_REMOVED_UNVERIFIED",
  ADMIN_ROLE_REVOKED: "ADMIN_ROLE_REVOKED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  USER_REGISTERED: "Cadastro criado",
  REGISTER_ATTEMPT_DUPLICATE: "Tentativa de cadastro com e-mail existente",
  EMAIL_VERIFIED: "E-mail confirmado",
  EMAIL_CHANGED: "E-mail alterado",
  PROFILE_UPDATED: "Perfil atualizado",
  ACCOUNT_LOCKED: "Conta bloqueada por tentativas",
  PASSWORD_CHANGED: "Senha alterada",
  PASSWORD_RESET_REQUESTED: "Redefinição de senha solicitada",
  PASSWORD_RESET_COMPLETED: "Redefinição de senha concluída",
  TWO_FACTOR_ENABLED: "2FA ativado",
  TWO_FACTOR_DISABLED: "2FA desativado",
  TWO_FACTOR_RESET_BY_ADMIN: "2FA resetado pelo administrador",
  ADMIN_USER_RENAMED: "Nome alterado pelo administrador",
  ADMIN_USER_EMAIL_CHANGED: "E-mail alterado pelo administrador",
  ADMIN_PASSWORD_RESET_SENT: "Link de redefinição enviado pelo administrador",
  ADMIN_ACCOUNT_UNLOCKED: "Conta desbloqueada pelo administrador",
  ADMIN_BACKUP_DOWNLOADED: "Backup baixado",
  ADMIN_BACKUP_CREATED: "Backup gerado",
  ADMIN_ACCESS_DENIED: "Acesso administrativo negado",
  ADMIN_ROLE_GRANTED: "Permissão de administrador concedida",
  ACCOUNT_REMOVED_UNVERIFIED: "Cadastro removido por falta de confirmação",
  ADMIN_ROLE_REVOKED: "Permissão de administrador removida",
};

/** Motivos de falha de login, como gravados em `LoginAudit.reason`. */
export const LOGIN_FAILURE_LABELS: Record<string, string> = {
  USER_NOT_FOUND: "E-mail não cadastrado",
  WRONG_PASSWORD: "Senha incorreta",
  ACCOUNT_LOCKED: "Conta bloqueada",
  EMAIL_NOT_VERIFIED: "E-mail não confirmado",
  INVALID_TOTP: "Código 2FA inválido",
  INVALID_RECOVERY_CODE: "Código de recuperação inválido",
};

/** Agrupamento usado nos filtros da tela de auditoria. */
export const AUDIT_CATEGORIES = {
  LOGIN: "Acessos",
  ACCOUNT: "Conta",
  PASSWORD: "Senha",
  TWO_FACTOR: "Dois fatores",
  ADMIN: "Administração",
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

export function categoryOf(action: string): AuditCategory {
  if (action.startsWith("ADMIN_")) return "ADMIN";
  if (action.startsWith("TWO_FACTOR")) return "TWO_FACTOR";
  if (action.startsWith("PASSWORD")) return "PASSWORD";
  if (action === "LOGIN_SUCCESS" || action === "LOGIN_FAILED") return "LOGIN";
  return "ACCOUNT";
}

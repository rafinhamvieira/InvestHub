/**
 * Autorização da plataforma — fonte única.
 *
 * Nenhum lugar do código compara papéis (`role === "ADMIN"`). Quem decide é `can()`, sempre
 * sobre uma permissão nomeada. O ganho aparece quando um cargo novo surge: ele entra no mapa
 * abaixo e a aplicação inteira já o respeita, sem varredura por comparações espalhadas.
 *
 * Há um teste que falha se uma comparação de papel reaparecer fora deste arquivo.
 */

import type { Role } from "@prisma/client";

export enum Permission {
  /** Ler a trilha de auditoria e exportá-la. */
  VIEW_AUDIT = "VIEW_AUDIT",
  /** Rodar a verificação de integridade da cadeia. */
  VERIFY_AUDIT_INTEGRITY = "VERIFY_AUDIT_INTEGRITY",
  /** Listar contas e agir sobre elas (nome, e-mail, senha, 2FA, bloqueio, sessões). */
  MANAGE_USERS = "MANAGE_USERS",
  /** Listar, gerar e baixar backups. */
  MANAGE_BACKUPS = "MANAGE_BACKUPS",
  /** Restaurar backup sobre o banco em uso. */
  RESTORE_BACKUP = "RESTORE_BACKUP",
  /** Ver saúde de banco, cache, agendador e integrações. */
  VIEW_SYSTEM_HEALTH = "VIEW_SYSTEM_HEALTH",
  /** Alterar configurações da plataforma. */
  MANAGE_PLATFORM = "MANAGE_PLATFORM",
  /** Conceder e remover cargos. */
  MANAGE_ROLES = "MANAGE_ROLES",
  /** Central de segurança. */
  VIEW_SECURITY_CENTER = "VIEW_SECURITY_CENTER",
}

/**
 * Cargo → permissões.
 *
 * `SUPER_ADMIN` é o único com `MANAGE_ROLES`, `RESTORE_BACKUP` e `VERIFY_AUDIT_INTEGRITY`:
 * são as três capacidades que permitem, respectivamente, fabricar um administrador, trocar
 * o banco inteiro e atestar a própria trilha. Concentrá-las num cargo só é o que mantém a
 * auditoria confiável.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  USER: [],

  READ_ONLY: [Permission.VIEW_AUDIT, Permission.VIEW_SYSTEM_HEALTH],

  AUDITOR: [Permission.VIEW_AUDIT, Permission.VIEW_SECURITY_CENTER, Permission.VIEW_SYSTEM_HEALTH],

  SUPPORT: [Permission.VIEW_AUDIT, Permission.MANAGE_USERS, Permission.VIEW_SYSTEM_HEALTH],

  ADMIN: [
    Permission.VIEW_AUDIT,
    Permission.MANAGE_USERS,
    Permission.MANAGE_BACKUPS,
    Permission.VIEW_SYSTEM_HEALTH,
    Permission.MANAGE_PLATFORM,
    Permission.VIEW_SECURITY_CENTER,
  ],

  SUPER_ADMIN: Object.values(Permission),
};

export interface Principal {
  id: string;
  role: Role;
}

export function can(principal: Principal | null | undefined, permission: Permission): boolean {
  if (!principal) return false;
  return ROLE_PERMISSIONS[principal.role]?.includes(permission) ?? false;
}

/** Alguma permissão administrativa — decide se o item do painel aparece no menu. */
export function hasAdminAccess(principal: Principal | null | undefined): boolean {
  if (!principal) return false;
  return (ROLE_PERMISSIONS[principal.role]?.length ?? 0) > 0;
}

/** Rótulos para as telas de cargo (Etapa 6 usa; já vive aqui para não duplicar depois). */
export const ROLE_LABELS: Record<Role, string> = {
  USER: "Usuário",
  READ_ONLY: "Somente leitura",
  AUDITOR: "Auditoria",
  SUPPORT: "Suporte",
  ADMIN: "Administrador",
  SUPER_ADMIN: "Super administrador",
};

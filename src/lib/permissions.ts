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
  /**
   * Listar, gerar e baixar backups.
   *
   * **Dá acesso a todo dado financeiro da plataforma.** O dump é o banco inteiro; quem o
   * baixa escolhe a senha da cifra e portanto consegue abri-lo. Ver
   * `FINANCIAL_EXPOSURE_PERMISSIONS`.
   */
  MANAGE_BACKUPS = "MANAGE_BACKUPS",
  /** Restaurar backup sobre o banco em uso. */
  RESTORE_BACKUP = "RESTORE_BACKUP",
  /** Ver saúde de banco, cache, agendador e integrações. */
  VIEW_SYSTEM_HEALTH = "VIEW_SYSTEM_HEALTH",
  /** Ver os números de negócio da plataforma: contas, patrimônio, proventos, cobertura. */
  VIEW_BUSINESS_METRICS = "VIEW_BUSINESS_METRICS",
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

  READ_ONLY: [Permission.VIEW_AUDIT, Permission.VIEW_SYSTEM_HEALTH, Permission.VIEW_BUSINESS_METRICS],

  // Sem `VIEW_BUSINESS_METRICS`: auditoria e suporte existem para investigar eventos e
  // atender contas. Patrimônio sob gestão e receita da base não ajudam em nenhuma das duas
  // tarefas, e todo dado a mais no alcance de um cargo é dado a mais vazando junto com ele.
  AUDITOR: [Permission.VIEW_AUDIT, Permission.VIEW_SECURITY_CENTER, Permission.VIEW_SYSTEM_HEALTH],

  SUPPORT: [Permission.VIEW_AUDIT, Permission.MANAGE_USERS, Permission.VIEW_SYSTEM_HEALTH],

  // Sem `MANAGE_BACKUPS`: o dump é o banco inteiro, e quem o baixa escolhe a senha da cifra
  // — ou seja, consegue abri-lo e ler a carteira de todo mundo. Administrar a plataforma não
  // pode implicar em ler o patrimônio de quem a usa.
  ADMIN: [
    Permission.VIEW_AUDIT,
    Permission.MANAGE_USERS,
    Permission.VIEW_SYSTEM_HEALTH,
    Permission.VIEW_BUSINESS_METRICS,
    Permission.MANAGE_PLATFORM,
    Permission.VIEW_SECURITY_CENTER,
  ],

  SUPER_ADMIN: Object.values(Permission),
};

/**
 * Permissões que dão acesso — direto ou indireto — a dado financeiro de usuário.
 *
 * A promessa da plataforma é que ninguém enxerga a carteira alheia. As telas cumprem isso
 * por construção: nenhum serviço administrativo alcança posição, transação ou provento. O
 * backup é a exceção inevitável, porque backup que exclui dado não é backup — e o dump
 * carrega tudo.
 *
 * Por isso estas permissões ficam concentradas no `SUPER_ADMIN`, que é quem já opera o
 * servidor e teria acesso ao banco de qualquer forma. Conceder a mais alguém é ampliar o
 * conjunto de pessoas capazes de ler a carteira de todos — decisão que não deve acontecer
 * por descuido, e é o que o teste sobre esta lista impede.
 */
export const FINANCIAL_EXPOSURE_PERMISSIONS: Permission[] = [
  Permission.MANAGE_BACKUPS,
  Permission.RESTORE_BACKUP,
];

export interface Principal {
  id: string;
  role: Role;
}

export function can(principal: Principal | null | undefined, permission: Permission): boolean {
  if (!principal) return false;
  return ROLE_PERMISSIONS[principal.role]?.includes(permission) ?? false;
}

/** Cargo com algum poder administrativo — a definição de "equipe", em um lugar só. */
export function isPrivilegedRole(role: Role): boolean {
  return (ROLE_PERMISSIONS[role]?.length ?? 0) > 0;
}

/** Alguma permissão administrativa — decide se o item do painel aparece no menu. */
export function hasAdminAccess(principal: Principal | null | undefined): boolean {
  if (!principal) return false;
  return isPrivilegedRole(principal.role);
}

/**
 * Cargos que enxergam alguma tela administrativa.
 *
 * Derivado do mapa, nunca listado à mão: consulta que precise separar "equipe" de "usuário"
 * — contar administradores, por exemplo — pergunta aqui em vez de comparar papéis.
 */
export function adminRoles(): Role[] {
  return (Object.keys(ROLE_PERMISSIONS) as Role[]).filter(isPrivilegedRole);
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

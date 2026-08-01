import type { AuditCategory } from "@/constants/audit";

/**
 * Evento de auditoria já normalizado para a tela.
 *
 * `LoginAudit` e `AuditLog` são tabelas separadas — uma guarda tentativa de acesso, a outra
 * ação sensível — mas para quem investiga um incidente elas são a mesma linha do tempo.
 * A fusão acontece na leitura; gravar tudo numa tabela só custaria o índice por e-mail que
 * a auditoria de login precisa para achar tentativa de conta inexistente.
 */
export interface AuditEntry {
  id: string;
  /** "LOGIN" para a trilha de acesso, "ACTION" para a trilha de ações. */
  source: "LOGIN" | "ACTION";
  action: string;
  label: string;
  category: AuditCategory;
  /** Null quando o evento não pertence a uma conta existente (ex: login em e-mail inválido). */
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  success: boolean | null;
  /** Motivo da falha, já traduzido. */
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** Alvo de uma ação administrativa. */
  targetUserId: string | null;
  createdAt: string;
}

export interface AuditFilters {
  /** Busca por nome ou e-mail. */
  search?: string;
  category?: AuditCategory;
  userId?: string;
  /** ISO. */
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

/**
 * Usuário como o painel administrativo o enxerga.
 *
 * A lista de campos é a fronteira de privacidade do produto: identidade, estado de acesso e
 * segurança — nada de patrimônio, posições, transações ou metas. Se um campo financeiro
 * aparecer aqui um dia, foi por engano.
 */
export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  role: "USER" | "ADMIN";
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** ISO enquanto o bloqueio estiver valendo; null quando a conta está liberada. */
  lockedUntil: string | null;
  failedLoginAttempts: number;
  lastLoginAt: string | null;
  /** Horas restantes para confirmar o e-mail antes da remoção automática; null quando já confirmou. */
  expiresInHours: number | null;
  createdAt: string;
}

export interface AdminUserPage {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

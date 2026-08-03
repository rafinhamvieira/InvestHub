import type { AuditCategory } from "@/constants/audit";
import type { Role, SessionType } from "@prisma/client";

/** Evento de auditoria normalizado para a tela e para a exportação. */
export interface AuditEntry {
  id: string;
  seq: string;
  action: string;
  label: string;
  category: AuditCategory;
  result: "SUCCESS" | "FAILED";

  /** Quem sofreu a ação. */
  targetName: string | null;
  targetEmail: string | null;
  /** Quem executou; null em evento do próprio sistema. */
  actorName: string | null;
  actorEmail: string | null;
  /** True quando autor e alvo são a mesma pessoa. */
  selfService: boolean;

  sessionId: string | null;
  reason: string | null;
  notes: string | null;
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditFilters {
  search?: string;
  category?: AuditCategory;
  action?: string;
  result?: "SUCCESS" | "FAILED";
  userId?: string;
  /** ISO. */
  from?: string;
  to?: string;
  /** `seq` do último item da página anterior. */
  cursor?: string;
  pageSize: number;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** `seq` para pedir a próxima página; null quando acabou. */
  nextCursor: string | null;
  total: number;
}

/** Resultado da verificação da cadeia de integridade. */
export interface IntegrityReport {
  totalRecords: number;
  /**
   * Registros do começo da trilha gravados antes de a cadeia existir — a migração que criou
   * o trigger não preencheu o que já estava na tabela. Ficam de fora da verificação, e o
   * laudo os declara em vez de tratá-los como adulteração.
   */
  unchainedRecords: number;
  /** Último checkpoint cujo HMAC confere. */
  lastValidCheckpoint: { seq: string; createdAt: string } | null;
  /** Primeiro registro com hash divergente; null quando a cadeia está íntegra. */
  firstInvalidRecord: {
    seq: string;
    expectedHash: string;
    foundHash: string | null;
    createdAt: string;
  } | null;
  /** Buracos na sequência — evidência de remoção. */
  missingSequences: string[];
  verifiedAt: string;
  durationMs: number;
  valid: boolean;
}

export interface SessionDTO {
  id: string;
  type: SessionType;
  browser: string | null;
  os: string | null;
  location: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  /** True para a sessão de onde a requisição atual veio. */
  current: boolean;
}

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  lastLoginAt: string | null;
  expiresInHours: number | null;
  activeSessions: number;
  createdAt: string;
}

export interface AdminUserPage {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

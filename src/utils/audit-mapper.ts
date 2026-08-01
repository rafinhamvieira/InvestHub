/**
 * Normalização das duas trilhas de auditoria — puro, sem I/O.
 *
 * `LoginAudit` guarda tentativa de acesso; `AuditLog` guarda ação sensível. Para quem
 * investiga um incidente as duas são a mesma linha do tempo, então a fusão acontece na
 * leitura. Separá-las na gravação é proposital: a trilha de acesso precisa de índice por
 * e-mail para achar tentativa contra conta que nem existe.
 */

import {
  AUDIT_ACTION_LABELS,
  LOGIN_FAILURE_LABELS,
  categoryOf,
  type AuditAction,
} from "@/constants/audit";
import type { AuditEntry } from "@/types/audit";

interface UserRef {
  id: string;
  name: string | null;
  email: string;
}

export interface ActionRow {
  id: string;
  action: string;
  userId: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: UserRef | null;
}

export interface LoginRow {
  id: string;
  email: string;
  success: boolean;
  reason: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: UserRef | null;
}

/** Ação desconhecida vira o próprio código: melhor um rótulo feio que uma linha vazia. */
function labelOf(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}

export function mapActionRow(row: ActionRow): AuditEntry {
  return {
    id: `action:${row.id}`,
    source: "ACTION",
    action: row.action,
    label: labelOf(row.action),
    category: categoryOf(row.action),
    userId: row.userId,
    userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null,
    success: null,
    reason: null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    // Em ação administrativa o autor vai em `userId` e o alvo em `entityId`.
    targetUserId: row.entityId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapLoginRow(row: LoginRow): AuditEntry {
  const action = row.success ? "LOGIN_SUCCESS" : "LOGIN_FAILED";

  return {
    id: `login:${row.id}`,
    source: "LOGIN",
    action,
    label: row.success ? "Login realizado" : "Tentativa de login falhou",
    category: "LOGIN",
    userId: row.userId,
    userName: row.user?.name ?? null,
    // Conta inexistente não tem cadastro: o e-mail digitado é o único rastro que sobra.
    userEmail: row.user?.email ?? row.email,
    success: row.success,
    reason: row.reason ? (LOGIN_FAILURE_LABELS[row.reason] ?? row.reason) : null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    targetUserId: null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Funde as duas listas em ordem cronológica decrescente e recorta a página pedida. */
export function mergeEntries(
  entries: AuditEntry[][],
  page: number,
  pageSize: number,
): AuditEntry[] {
  const all = entries.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const start = (page - 1) * pageSize;
  return all.slice(start, start + pageSize);
}

/** Linha do CSV exportado. Ponto e vírgula porque o Excel em pt-BR espera esse separador. */
export function toCsv(entries: AuditEntry[]): string {
  const header = "Data;Evento;Categoria;Usuário;E-mail;Resultado;Motivo;IP";
  const escape = (value: string | null) => (value ?? "").replace(/[;\n\r"]/g, " ");

  const lines = entries.map((entry) =>
    [
      new Date(entry.createdAt).toLocaleString("pt-BR"),
      escape(entry.label),
      entry.category,
      escape(entry.userName),
      escape(entry.userEmail),
      entry.success === null ? "" : entry.success ? "sucesso" : "falha",
      escape(entry.reason),
      escape(entry.ipAddress),
    ].join(";"),
  );

  return [header, ...lines].join("\n");
}

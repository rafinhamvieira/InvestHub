/**
 * Porta única de escrita e leitura da auditoria.
 *
 * Nenhum serviço fala com o repositório direto. É essa concentração que permite garantir, em
 * um lugar só, três coisas que de outro modo dependeriam da disciplina de quem escreve
 * código novo: justificativa presente onde é exigida, sessão registrada em todo evento, e a
 * política de falha correta para cada tipo de ação.
 *
 * **Política de falha** (a distinção importa mais do que parece):
 *
 *  - evento **crítico de segurança** — login, senha, MFA, e-mail, cargos, restauração:
 *    se o log não gravar, a operação é abortada. Perder o registro desses eventos é perder
 *    exatamente a evidência que a auditoria existe para guardar;
 *  - evento **comum** — preferências, tema, perfil: o erro vai para os logs da aplicação e
 *    o fluxo segue. Indisponibilidade da auditoria não justifica derrubar a experiência.
 */

import { auditLogRepository, type AuditAppendInput } from "@/repositories/audit-log.repository";
import { logger } from "@/lib/logger";
import {
  AUDIT_ACTION_LABELS,
  categoryOf,
  isSecurityCritical,
  requiresReason,
  type AuditAction,
} from "@/constants/audit";
import type { AuditEntry, AuditFilters, AuditPage } from "@/types/audit";
import type { Prisma } from "@prisma/client";

export class AuditWriteError extends Error {
  constructor(public override cause: unknown) {
    super("Não foi possível registrar o evento de auditoria.");
    this.name = "AuditWriteError";
  }
}

export class AuditReasonRequiredError extends Error {
  constructor(action: string) {
    super(`A ação ${action} exige justificativa.`);
    this.name = "AuditReasonRequiredError";
  }
}

/** Teto de linhas por exportação — evita que um clique tente materializar a base inteira. */
const EXPORT_LIMIT = 10_000;

/**
 * Linha da trilha com autor e alvo já resolvidos pelo repositório.
 *
 * A hidratação deixou de ser um `include` do Prisma quando a chave estrangeira para `users`
 * saiu — ela obrigava a trilha a ser alterável na exclusão de conta. O formato aqui é o
 * mesmo de antes; muda quem o monta.
 */
type Person = { id: string; name: string | null; email: string };

type AuditRow = Prisma.AuditLogGetPayload<object> & {
  user: Person | null;
  actor: Person | null;
};

function describe(row: AuditRow): string {
  const label = AUDIT_ACTION_LABELS[row.action as AuditAction] ?? row.action;
  const target = row.user?.email ?? row.targetEmail;
  const actor = row.actor?.email ?? row.actorEmail;

  if (actor && target && actor !== target) return `${actor} → ${label} · ${target}`;
  if (target) return `${label} · ${target}`;
  return label;
}

export function toEntry(row: AuditRow): AuditEntry {
  const targetEmail = row.user?.email ?? row.targetEmail;
  const actorEmail = row.actor?.email ?? row.actorEmail;

  return {
    id: row.id,
    seq: row.seq.toString(),
    action: row.action,
    label: AUDIT_ACTION_LABELS[row.action as AuditAction] ?? row.action,
    category: categoryOf(row.action),
    result: row.result === "FAILED" ? "FAILED" : "SUCCESS",
    targetName: row.user?.name ?? null,
    targetEmail,
    actorName: row.actor?.name ?? null,
    actorEmail,
    selfService: Boolean(actorEmail && targetEmail && actorEmail === targetEmail),
    sessionId: row.sessionId,
    reason: row.reason,
    notes: row.notes,
    description: describe(row),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

export const auditService = {
  /**
   * Registra um evento.
   *
   * Lança quando a ação é crítica e a gravação falha — quem chamou decide o que fazer, mas
   * a decisão nunca é "seguir em silêncio". Para ação comum, engole o erro depois de
   * registrá-lo nos logs da aplicação.
   */
  async record(input: AuditAppendInput): Promise<void> {
    if (requiresReason(input.action) && !input.reason?.trim()) {
      throw new AuditReasonRequiredError(input.action);
    }

    try {
      await auditLogRepository.append(input);
    } catch (error) {
      logger.error("Falha ao gravar auditoria", {
        action: input.action,
        actorId: input.actorId,
        userId: input.userId,
        critical: isSecurityCritical(input.action),
        error: (error as Error).message,
      });

      if (isSecurityCritical(input.action)) throw new AuditWriteError(error);
    }
  },

  async list(filters: AuditFilters): Promise<AuditPage> {
    // Contagem e página em paralelo: são consultas independentes sobre o mesmo filtro.
    const [{ rows, nextCursor }, total] = await Promise.all([
      auditLogRepository.listPage(filters),
      auditLogRepository.count(filters),
    ]);

    return { entries: rows.map(toEntry), nextCursor, total };
  },

  async listForExport(filters: AuditFilters): Promise<AuditEntry[]> {
    const rows = await auditLogRepository.listForExport(filters, EXPORT_LIMIT);
    return rows.map(toEntry);
  },
};

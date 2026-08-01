import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AuditFilters } from "@/types/audit";
import type { AuditCategory } from "@/constants/audit";

interface RecordAuditInput {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

/** Prefixos de ação por categoria — o filtro da tela traduz categoria em `startsWith`. */
const CATEGORY_PREFIXES: Record<AuditCategory, string[]> = {
  LOGIN: [],
  ACCOUNT: ["USER_", "EMAIL_", "PROFILE_", "ACCOUNT_", "REGISTER_"],
  PASSWORD: ["PASSWORD_"],
  TWO_FACTOR: ["TWO_FACTOR"],
  ADMIN: ["ADMIN_"],
};

/** User-agent chega a ter 500+ caracteres; o que identifica o cliente está no começo. */
const USER_AGENT_MAX = 200;

export const auditLogRepository = {
  record(input: RecordAuditInput) {
    return prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        metadata: input.metadata,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent?.slice(0, USER_AGENT_MAX),
      },
    });
  },

  /** Ações sensíveis com o autor junto — metade da trilha exibida na administração. */
  async listActions(filters: AuditFilters) {
    const where = buildActionWhere(filters);

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { rows, total };
  },
};

/**
 * Monta o filtro do Prisma a partir dos parâmetros da tela.
 *
 * Exportado para teste: é a parte com regra de verdade — categoria vira prefixo de ação,
 * busca cobre nome e e-mail, período é inclusivo nas duas pontas — e a que quebraria em
 * silêncio, devolvendo resultado a menos sem ninguém perceber.
 */
export function buildActionWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.userId) where.userId = filters.userId;

  if (filters.category) {
    const prefixes = CATEGORY_PREFIXES[filters.category];
    // "Acessos" não existe nesta tabela: aquela trilha vive em LoginAudit.
    if (prefixes.length === 0) return { id: "__sem-correspondencia__" };
    where.OR = prefixes.map((prefix) => ({ action: { startsWith: prefix } }));
  }

  if (filters.search) {
    where.user = {
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ],
    };
  }

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }

  return where;
}

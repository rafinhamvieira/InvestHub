import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AuditFilters } from "@/types/audit";

interface RecordLoginAttemptInput {
  userId?: string | null;
  email: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

export const loginAuditRepository = {
  record(input: RecordLoginAttemptInput) {
    return prisma.loginAudit.create({
      data: {
        userId: input.userId ?? null,
        email: input.email,
        success: input.success,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        reason: input.reason,
      },
    });
  },

  listByUser(userId: string, limit = 20) {
    return prisma.loginAudit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  /** Trilha de acessos de toda a plataforma — a outra metade da auditoria. */
  async listAll(filters: AuditFilters) {
    const where = buildLoginWhere(filters);

    const [rows, total] = await Promise.all([
      prisma.loginAudit.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.loginAudit.count({ where }),
    ]);

    return { rows, total };
  },

  /** Último acesso bem-sucedido de cada usuário, para a listagem da administração. */
  async lastSuccessByUsers(userIds: string[]): Promise<Map<string, Date>> {
    if (userIds.length === 0) return new Map();

    const rows = await prisma.loginAudit.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, success: true },
      _max: { createdAt: true },
    });

    return new Map(
      rows.flatMap((row) =>
        row.userId && row._max.createdAt ? [[row.userId, row._max.createdAt] as const] : [],
      ),
    );
  },
};

/**
 * Filtro da trilha de acessos.
 *
 * A busca aqui bate no campo `email` da própria tabela, não no cadastro: tentativa de login
 * em e-mail inexistente não tem usuário associado, e é justamente esse caso que interessa
 * numa investigação de acesso indevido.
 */
export function buildLoginWhere(filters: AuditFilters): Prisma.LoginAuditWhereInput {
  const where: Prisma.LoginAuditWhereInput = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.search) where.email = { contains: filters.search, mode: "insensitive" };

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }

  return where;
}

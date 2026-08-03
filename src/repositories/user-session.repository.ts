import { prisma } from "@/lib/prisma";
import type { SessionType } from "@prisma/client";

export interface CreateSessionInput {
  userId: string;
  type?: SessionType;
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  location?: string | null;
  fingerprint?: string | null;
  expiresAt: Date;
}

export const userSessionRepository = {
  create(input: CreateSessionInput) {
    return prisma.userSession.create({
      data: {
        userId: input.userId,
        type: input.type ?? "WEB",
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        browser: input.browser ?? null,
        os: input.os ?? null,
        location: input.location ?? null,
        fingerprint: input.fingerprint ?? null,
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });
  },

  findById(id: string) {
    return prisma.userSession.findUnique({
      where: { id },
      select: { id: true, userId: true, createdAt: true, expiresAt: true, revokedAt: true },
    });
  },

  listByUser(userId: string) {
    return prisma.userSession.findMany({
      where: { userId },
      orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }],
      take: 50,
    });
  },

  /** Sessões vivas por usuário, em uma consulta — evita N+1 na listagem administrativa. */
  async countActiveByUsers(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const rows = await prisma.userSession.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, revokedAt: null, expiresAt: { gt: new Date() } },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.userId, row._count._all]));
  },

  touch(id: string) {
    return prisma.userSession.update({
      where: { id },
      data: { lastSeenAt: new Date() },
      select: { id: true },
    });
  },

  revoke(id: string, revokedBy: string | null, reason: string) {
    return prisma.userSession.updateMany({
      // `updateMany` com filtro de não revogada: revogar duas vezes não sobrescreve o
      // motivo e a data originais.
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy, revocationReason: reason },
    });
  },

  revokeAllForUser(userId: string, revokedBy: string | null, reason: string, exceptId?: string) {
    return prisma.userSession.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date(), revokedBy, revocationReason: reason },
    });
  },
};

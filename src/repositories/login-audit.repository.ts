import { prisma } from "@/lib/prisma";



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


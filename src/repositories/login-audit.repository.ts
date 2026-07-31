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
};

import { prisma } from "@/lib/prisma";

export const passwordResetRepository = {
  create(userId: string, token: string, expiresAt: Date) {
    return prisma.passwordResetToken.create({ data: { userId, token, expiresAt } });
  },

  findValidByToken(token: string) {
    return prisma.passwordResetToken.findFirst({
      where: { token, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
  },

  markUsed(id: string) {
    return prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  invalidateAllForUser(userId: string) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  },
};

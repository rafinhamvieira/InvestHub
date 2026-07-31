import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

export const userRepository = {
  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data: { name: string; email: string; passwordHash: string }): Promise<User> {
    return prisma.user.create({ data });
  },

  update(
    userId: string,
    data: Partial<
      Pick<User, "name" | "riskProfile" | "currency" | "locale" | "theme" | "emailNotifications">
    >,
  ): Promise<User> {
    return prisma.user.update({ where: { id: userId }, data });
  },

  markEmailVerified(userId: string): Promise<User> {
    return prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  },

  updatePasswordHash(userId: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });
  },

  incrementFailedAttempts(userId: string, lockUntil: Date | null): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: { increment: 1 },
        ...(lockUntil ? { lockedUntil: lockUntil } : {}),
      },
    });
  },

  resetFailedAttempts(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  },

  setTwoFactorSecret(userId: string, encryptedSecret: string, recoveryCodes: string[]): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: recoveryCodes,
      },
    });
  },

  disableTwoFactor(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: null, twoFactorEnabled: false, twoFactorRecoveryCodes: [] },
    });
  },

  consumeRecoveryCode(userId: string, remainingCodes: string[]): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { twoFactorRecoveryCodes: remainingCodes },
    });
  },
};

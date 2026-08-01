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

  /**
   * Listagem do painel administrativo.
   *
   * O `select` é explícito e enxuto de propósito: sem `include` de carteira, sem `_count`
   * de transações. O que não é selecionado aqui não tem como vazar para a tela.
   */
  async listForAdmin(options: { search?: string; page: number; pageSize: number }) {
    const where = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: "insensitive" as const } },
            { email: { contains: options.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
          twoFactorEnabled: true,
          lockedUntil: true,
          failedLoginAttempts: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return { rows, total };
  },

  updateEmail(userId: string, email: string): Promise<User> {
    // O e-mail novo entra como não verificado: quem prova a posse é o dono da caixa,
    // não quem digitou o endereço no painel.
    return prisma.user.update({
      where: { id: userId },
      data: { email, emailVerified: null },
    });
  },

  unlock(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
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

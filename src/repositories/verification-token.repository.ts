import { prisma } from "@/lib/prisma";

/**
 * Reutiliza a tabela VerificationToken do Auth.js para o fluxo de confirmação de e-mail.
 * `identifier` recebe o e-mail do usuário.
 */
export const verificationTokenRepository = {
  create(identifier: string, token: string, expires: Date) {
    return prisma.verificationToken.create({ data: { identifier, token, expires } });
  },

  findValidByToken(token: string) {
    return prisma.verificationToken.findFirst({
      where: { token, expires: { gt: new Date() } },
    });
  },

  deleteByToken(token: string) {
    return prisma.verificationToken.delete({ where: { token } }).catch(() => null);
  },

  invalidateAllForIdentifier(identifier: string) {
    return prisma.verificationToken.deleteMany({ where: { identifier } });
  },
};

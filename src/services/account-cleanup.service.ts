/**
 * Remoção de cadastros que nunca confirmaram o e-mail.
 *
 * Conta sem confirmação é um endereço que ninguém provou controlar: ocupa o e-mail (nenhum
 * outro cadastro consegue usá-lo), aparece na listagem administrativa e, se o endereço for
 * de outra pessoa, mantém um cadastro no nome dela sem o consentimento dela. Passado o
 * prazo, sai da base.
 *
 * Três travas antes de apagar qualquer coisa:
 *  - **nunca** remove administrador;
 *  - **nunca** remove quem já tem transação lançada — conta com dado dentro não é cadastro
 *    abandonado, é sinal de que algo saiu do fluxo esperado;
 *  - cada remoção entra na auditoria com o e-mail, para o registro sobreviver à conta.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { auditService } from "@/services/audit.service";
import { AUDIT_ACTIONS } from "@/constants/audit";
import { hasAdminAccess } from "@/lib/permissions";
import type { Role } from "@prisma/client";

/** Prazo para confirmar o e-mail. */
const UNVERIFIED_TTL_HOURS = Number(process.env.UNVERIFIED_ACCOUNT_TTL_HOURS ?? 24);

/** Decide se o cadastro venceu o prazo. Puro, para o limite ficar testável. */
export function isExpiredUnverified(
  user: { emailVerified: Date | null; createdAt: Date; role: string },
  reference: Date,
  ttlHours = UNVERIFIED_TTL_HOURS,
): boolean {
  if (user.emailVerified !== null) return false;
  if (hasAdminAccess({ id: "", role: user.role as Role })) return false;

  const ageHours = (reference.getTime() - user.createdAt.getTime()) / (60 * 60 * 1000);
  return ageHours >= ttlHours;
}

export const accountCleanupService = {
  /** Remove os cadastros vencidos. Devolve quantos saíram. */
  async removeUnverified(reference = new Date()): Promise<number> {
    const cutoff = new Date(reference.getTime() - UNVERIFIED_TTL_HOURS * 60 * 60 * 1000);

    const candidates = await prisma.user.findMany({
      where: {
        emailVerified: null,
        role: { in: ["USER"] },
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        _count: { select: { transactions: true } },
      },
    });

    let removed = 0;

    for (const candidate of candidates) {
      if (candidate._count.transactions > 0) {
        logger.warn("Cadastro não confirmado com transações — mantido para conferência", {
          email: candidate.email,
        });
        continue;
      }

      // A auditoria vem antes: a trilha não tem chave estrangeira para `users`, então o
      // registro sobrevive à conta, e o e-mail no metadata é o que permite saber depois quem
      // foi removido. Enquanto a chave existiu, este `delete` falhava — o próprio registro
      // recém-gravado disparava um UPDATE que o trigger de imutabilidade recusava.
      await auditService.record({
        userId: candidate.id,
        action: AUDIT_ACTIONS.ACCOUNT_REMOVED_UNVERIFIED,
        entity: "User",
        entityId: candidate.id,
        metadata: { email: candidate.email, createdAt: candidate.createdAt.toISOString() },
      });

      await prisma.user.delete({ where: { id: candidate.id } });
      removed++;
    }

    if (removed > 0) logger.info("Cadastros não confirmados removidos", { removed });
    return removed;
  },
};

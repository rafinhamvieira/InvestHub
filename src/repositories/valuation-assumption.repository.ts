import { prisma } from "@/lib/prisma";
import type { Prisma, ValuationMethod } from "@prisma/client";

type AssumptionData = Omit<
  Prisma.ValuationAssumptionUncheckedCreateInput,
  "userId" | "assetId" | "method"
>;

export const valuationAssumptionRepository = {
  /** Premissas do usuário para um ativo (específicas) e globais (assetId null). */
  findForUserAndAsset(userId: string, assetId: string) {
    return prisma.valuationAssumption.findMany({
      where: { userId, OR: [{ assetId }, { assetId: null }] },
    });
  },

  /** Upsert manual: assetId pode ser null (premissa global), o que invalida o unique composto do Prisma. */
  async upsert(
    userId: string,
    assetId: string | null,
    method: ValuationMethod,
    data: AssumptionData,
  ) {
    const existing = await prisma.valuationAssumption.findFirst({
      where: { userId, assetId, method },
    });
    if (existing) {
      return prisma.valuationAssumption.update({ where: { id: existing.id }, data });
    }
    return prisma.valuationAssumption.create({ data: { userId, assetId, method, ...data } });
  },
};

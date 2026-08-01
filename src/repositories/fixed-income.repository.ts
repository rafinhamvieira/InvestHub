import { prisma } from "@/lib/prisma";
import type { FixedIncomeIndexer } from "@prisma/client";

export interface FixedIncomeTermsInput {
  issuer: string | null;
  indexer: FixedIncomeIndexer;
  indexPercent: number | null;
  spreadPercent: number | null;
  startDate: Date;
  maturityDate: Date | null;
}

export const fixedIncomeRepository = {
  findByAsset(assetId: string) {
    return prisma.fixedIncomeTerms.findUnique({ where: { assetId } });
  },

  findByAssetIds(assetIds: string[]) {
    if (assetIds.length === 0) return Promise.resolve([]);
    return prisma.fixedIncomeTerms.findMany({ where: { assetId: { in: assetIds } } });
  },

  /** Todos os títulos ativos — base da atualização diária do valor unitário. */
  listAll() {
    return prisma.fixedIncomeTerms.findMany({
      include: { asset: { select: { id: true, ticker: true, name: true, type: true } } },
    });
  },

  upsert(assetId: string, terms: FixedIncomeTermsInput) {
    return prisma.fixedIncomeTerms.upsert({
      where: { assetId },
      update: {
        issuer: terms.issuer,
        indexer: terms.indexer,
        indexPercent: terms.indexPercent,
        spreadPercent: terms.spreadPercent,
        maturityDate: terms.maturityDate,
      },
      create: { assetId, ...terms },
    });
  },

  /**
   * Recua o início da curva quando aparece uma compra anterior à emissão registrada.
   * Sem isso, um lançamento retroativo teria valor unitário 1,00 numa data em que o papel
   * já rendia, e a rentabilidade sairia inflada.
   */
  async ensureStartDate(assetId: string, date: Date) {
    const terms = await prisma.fixedIncomeTerms.findUnique({ where: { assetId } });
    if (!terms || terms.startDate <= date) return terms;
    return prisma.fixedIncomeTerms.update({ where: { assetId }, data: { startDate: date } });
  },
};

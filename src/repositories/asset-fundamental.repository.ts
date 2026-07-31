import { prisma } from "@/lib/prisma";

export const assetFundamentalRepository = {
  /** Grava/atualiza o snapshot de indicadores do dia (campos null preservam valor anterior ausente). */
  upsertSnapshot(
    assetId: string,
    referenceDate: Date,
    data: { price?: number | null; pl?: number | null; dividendYield?: number | null; marketCap?: number | null },
  ) {
    const day = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
    );
    return prisma.assetFundamental.upsert({
      where: { assetId_referenceDate: { assetId, referenceDate: day } },
      update: data,
      create: { assetId, referenceDate: day, ...data },
    });
  },

  /** Série histórica completa de indicadores de um ativo (gráficos de histórico). */
  findHistoryByAsset(assetId: string) {
    return prisma.assetFundamental.findMany({
      where: { assetId },
      orderBy: { referenceDate: "asc" },
      select: {
        referenceDate: true,
        dividendYield: true,
        pl: true,
        pvp: true,
        roe: true,
      },
    });
  },

  /** Snapshot mais recente de indicadores de cada ativo. */
  findLatestByAssetIds(assetIds: string[]) {
    if (assetIds.length === 0) return Promise.resolve([]);
    return prisma.assetFundamental.findMany({
      where: { assetId: { in: assetIds } },
      orderBy: [{ assetId: "asc" }, { referenceDate: "desc" }],
      distinct: ["assetId"],
    });
  },
};

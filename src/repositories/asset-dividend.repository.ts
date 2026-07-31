import { prisma } from "@/lib/prisma";

export const assetDividendRepository = {
  /** Insere o provento se ainda não existir (mesma data-ex + valor). Retorna se criou. */
  async upsertEvent(
    assetId: string,
    event: { type: string; valuePerShare: number; exDate: Date; paymentDate: Date | null },
  ): Promise<{ created: boolean }> {
    const existing = await prisma.assetDividend.findFirst({
      where: { assetId, exDate: event.exDate, valuePerShare: event.valuePerShare },
      select: { id: true },
    });
    if (existing) return { created: false };
    await prisma.assetDividend.create({ data: { assetId, ...event } });
    return { created: true };
  },

  /** Proventos de um ativo, mais recentes primeiro. */
  findByAsset(assetId: string) {
    return prisma.assetDividend.findMany({
      where: { assetId },
      orderBy: { exDate: "desc" },
    });
  },

  /** Todos os proventos declarados dos ativos informados a partir de uma data. */
  findByAssetIds(assetIds: string[], since?: Date) {
    if (assetIds.length === 0) return Promise.resolve([]);
    return prisma.assetDividend.findMany({
      where: {
        assetId: { in: assetIds },
        ...(since ? { exDate: { gte: since } } : {}),
      },
      orderBy: { exDate: "asc" },
    });
  },
};

import { prisma } from "@/lib/prisma";

export const positionRepository = {
  findAllByUserWithAsset(userId: string) {
    return prisma.position.findMany({
      where: { userId, quantity: { gt: 0 } },
      include: {
        asset: { select: { id: true, ticker: true, name: true, type: true, sector: true } },
      },
      orderBy: { asset: { ticker: "asc" } },
    });
  },

  /** Quem tem posição aberta nestes ativos — base para notificar proventos. */
  findHoldersOfAssets(assetIds: string[]) {
    if (assetIds.length === 0) return Promise.resolve([]);
    return prisma.position.findMany({
      where: { assetId: { in: assetIds }, quantity: { gt: 0 } },
      select: {
        userId: true,
        assetId: true,
        quantity: true,
        user: { select: { email: true, emailNotifications: true } },
      },
    });
  },

  upsert(userId: string, assetId: string, data: { quantity: number; averagePrice: number; totalInvested: number }) {
    return prisma.position.upsert({
      where: { userId_assetId: { userId, assetId } },
      update: data,
      create: { userId, assetId, ...data },
    });
  },

  delete(userId: string, assetId: string) {
    return prisma.position
      .delete({ where: { userId_assetId: { userId, assetId } } })
      .catch(() => null);
  },
};

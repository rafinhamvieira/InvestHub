import { prisma } from "@/lib/prisma";

const DEFAULT_NAME = "Favoritos";

export const watchlistRepository = {
  /** Watchlist padrão do usuário, criada sob demanda. */
  async getDefault(userId: string) {
    return prisma.watchlist.upsert({
      where: { userId_name: { userId, name: DEFAULT_NAME } },
      update: {},
      create: { userId, name: DEFAULT_NAME },
    });
  },

  async listAssetIds(userId: string): Promise<Set<string>> {
    const items = await prisma.watchlistItem.findMany({
      where: { watchlist: { userId, name: DEFAULT_NAME } },
      select: { assetId: true },
    });
    return new Set(items.map((i) => i.assetId));
  },

  async toggle(userId: string, assetId: string): Promise<{ favorited: boolean }> {
    const watchlist = await this.getDefault(userId);
    const existing = await prisma.watchlistItem.findUnique({
      where: { watchlistId_assetId: { watchlistId: watchlist.id, assetId } },
    });

    if (existing) {
      await prisma.watchlistItem.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await prisma.watchlistItem.create({ data: { watchlistId: watchlist.id, assetId } });
    return { favorited: true };
  },

  listItemsWithAsset(userId: string) {
    return prisma.watchlistItem.findMany({
      where: { watchlist: { userId, name: DEFAULT_NAME } },
      include: {
        asset: { select: { id: true, ticker: true, name: true, type: true, sector: true } },
      },
      orderBy: { addedAt: "desc" },
    });
  },
};

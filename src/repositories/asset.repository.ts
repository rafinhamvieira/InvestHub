import { prisma } from "@/lib/prisma";
import type { AssetType } from "@prisma/client";

export const assetRepository = {
  findByTicker(ticker: string) {
    return prisma.asset.findUnique({ where: { ticker } });
  },

  /** Cria o ativo se não existir (dados mínimos; integrações enriquecem depois). */
  findOrCreate(ticker: string, type: AssetType) {
    return prisma.asset.upsert({
      where: { ticker },
      update: {},
      create: { ticker, name: ticker, type },
    });
  },

  listActive() {
    return prisma.asset.findMany({
      where: { isActive: true },
      select: { id: true, ticker: true, name: true, sector: true, type: true },
    });
  },

  /** Enriquece nome/setor vindos do provedor sem sobrescrever dados já preenchidos manualmente. */
  updateMeta(assetId: string, data: { name?: string | null; sector?: string | null }) {
    return prisma.asset.update({
      where: { id: assetId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.sector ? { sector: data.sector } : {}),
      },
    });
  },

  search(query: string, limit = 10) {
    return prisma.asset.findMany({
      where: {
        OR: [
          { ticker: { contains: query.toUpperCase() } },
          { name: { contains: query, mode: "insensitive" } },
        ],
        isActive: true,
      },
      take: limit,
      orderBy: { ticker: "asc" },
    });
  },
};

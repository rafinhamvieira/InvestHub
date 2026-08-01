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

  /**
   * Insere em lote os tickers do catálogo que ainda não existem.
   *
   * Sem isso a base só conhece o que alguém já comprou ou favoritou — e o screener,
   * que deveria varrer o mercado, acaba mostrando a própria carteira do usuário.
   */
  createManyFromCatalog(
    items: Array<{
      ticker: string;
      name: string;
      type: AssetType;
      sector: string | null;
      subsector: string | null;
    }>,
  ) {
    if (items.length === 0) return Promise.resolve({ count: 0 });
    return prisma.asset.createMany({ data: items, skipDuplicates: true });
  },

  listByTickers(tickers: string[]) {
    if (tickers.length === 0) return Promise.resolve([]);
    return prisma.asset.findMany({
      where: { ticker: { in: tickers } },
      select: { id: true, ticker: true, name: true, sector: true, subsector: true, type: true },
    });
  },

  /**
   * Ativos na fila de atualização de fundamentos, do mais desatualizado ao mais recente
   * (quem nunca teve fundamento vem primeiro).
   *
   * O provedor de fundamentos cobra por ticker e o plano gratuito dá 200 chamadas por dia
   * — não dá para varrer o mercado inteiro a cada ciclo. A rotação cobre a base aos poucos
   * em vez de atualizar sempre os mesmos ativos.
   */
  listStaleFundamentals(limit: number, types: AssetType[]) {
    return prisma.$queryRaw<Array<{ id: string; ticker: string; type: AssetType }>>`
      SELECT a.id, a.ticker, a.type
      FROM assets a
      LEFT JOIN (
        SELECT "assetId", MAX("createdAt") AS last_at
        FROM asset_fundamentals
        GROUP BY "assetId"
      ) f ON f."assetId" = a.id
      WHERE a."isActive" = true
        AND a.type::text = ANY(${types})
      ORDER BY f.last_at ASC NULLS FIRST
      LIMIT ${limit}
    `;
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

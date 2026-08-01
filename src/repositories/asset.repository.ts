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
   * Fila de atualização de fundamentos.
   *
   * O provedor cobra por ticker e o plano gratuito dá 200 chamadas por dia — varrer os
   * ~2000 ativos do catálogo a cada ciclo é impossível. A ordem da fila é o que decide se
   * a rotação é útil:
   *
   *  1. quem nunca foi tentado (`fundamentalsCheckedAt` nulo);
   *  2. entre esses, os mais líquidos primeiro — são os que alguém vai filtrar no screener,
   *     e não adianta gastar a cota do dia em papel que ninguém negocia;
   *  3. depois que todos foram tentados, a ordem vira "tentado há mais tempo" e a base
   *     passa a se renovar sozinha.
   *
   * O marcador é a **tentativa**, não o resultado: o provedor não cobre parte do mercado
   * (BDR inteiro, nomes pequenos) e usar a presença do indicador como critério prendia
   * esses ativos no início da fila para sempre.
   */
  listStaleFundamentals(limit: number, types: AssetType[]) {
    return prisma.$queryRaw<Array<{ id: string; ticker: string; type: AssetType }>>`
      SELECT a.id, a.ticker, a.type
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT f.liquidity
        FROM asset_fundamentals f
        WHERE f."assetId" = a.id
        ORDER BY f."referenceDate" DESC
        LIMIT 1
      ) latest ON true
      WHERE a."isActive" = true
        AND a.type::text = ANY(${types})
      ORDER BY a."fundamentalsCheckedAt" ASC NULLS FIRST,
               COALESCE(latest.liquidity, 0) DESC
      LIMIT ${limit}
    `;
  },

  /** Carimba a tentativa de busca, com ou sem dado devolvido pela fonte. */
  markFundamentalsChecked(assetIds: string[]) {
    if (assetIds.length === 0) return Promise.resolve({ count: 0 });
    return prisma.asset.updateMany({
      where: { id: { in: assetIds } },
      data: { fundamentalsCheckedAt: new Date() },
    });
  },

  markDividendsChecked(assetIds: string[]) {
    if (assetIds.length === 0) return Promise.resolve({ count: 0 });
    return prisma.asset.updateMany({
      where: { id: { in: assetIds } },
      data: { dividendsCheckedAt: new Date() },
    });
  },

  /**
   * Fila de importação de proventos, mesma lógica da fila de fundamentos: quem não tem
   * nenhum provento entra primeiro, e entre esses os mais líquidos.
   *
   * As fontes de proventos são gratuitas, mas custam duas requisições HTTP por ticker —
   * varrer o catálogo inteiro de uma vez seria abusivo com quem hospeda os dados.
   */
  listStaleDividends(limit: number, types: AssetType[]) {
    return prisma.$queryRaw<Array<{ id: string; ticker: string; type: AssetType }>>`
      SELECT a.id, a.ticker, a.type
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT f.liquidity
        FROM asset_fundamentals f
        WHERE f."assetId" = a.id
        ORDER BY f."referenceDate" DESC
        LIMIT 1
      ) latest ON true
      WHERE a."isActive" = true
        AND a.type::text = ANY(${types})
      ORDER BY a."dividendsCheckedAt" ASC NULLS FIRST,
               COALESCE(latest.liquidity, 0) DESC
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

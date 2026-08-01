import { prisma } from "@/lib/prisma";

export const assetPriceRepository = {
  /** Grava/atualiza o candle do dia. */
  upsertDaily(
    assetId: string,
    date: Date,
    data: { close: number; open?: number | null; high?: number | null; low?: number | null; volume?: number | null },
  ) {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    return prisma.assetPrice.upsert({
      where: { assetId_date: { assetId, date: day } },
      update: { close: data.close, open: data.open, high: data.high, low: data.low, volume: data.volume },
      create: { assetId, date: day, close: data.close, open: data.open, high: data.high, low: data.low, volume: data.volume },
    });
  },

  /**
   * Grava o fechamento do dia de vários ativos numa tacada.
   *
   * O catálogo traz o mercado inteiro numa requisição; escrever ativo a ativo seriam
   * ~2000 idas ao banco por ciclo. Dias já gravados são ignorados — quem precisa de preço
   * intradiário atualizado continua passando por `upsertDaily`.
   */
  createManyDaily(entries: Array<{ assetId: string; close: number; volume?: number | null }>, date: Date) {
    if (entries.length === 0) return Promise.resolve({ count: 0 });
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    return prisma.assetPrice.createMany({
      data: entries.map((entry) => ({
        assetId: entry.assetId,
        date: day,
        close: entry.close,
        volume: entry.volume ?? null,
      })),
      skipDuplicates: true,
    });
  },

  /** Insere histórico em lote ignorando dias já existentes. */
  createManyHistory(
    assetId: string,
    bars: Array<{ date: Date; close: number; open?: number | null; high?: number | null; low?: number | null; volume?: number | null }>,
  ) {
    return prisma.assetPrice.createMany({
      data: bars.map((bar) => ({
        assetId,
        date: new Date(Date.UTC(bar.date.getUTCFullYear(), bar.date.getUTCMonth(), bar.date.getUTCDate())),
        close: bar.close,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        volume: bar.volume,
      })),
      skipDuplicates: true,
    });
  },

  /** Contagem de candles recentes (para decidir backfill de histórico). */
  countRecent(assetId: string, sinceDays: number) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    return prisma.assetPrice.count({ where: { assetId, date: { gte: since } } });
  },

  /** Última cotação conhecida de cada ativo. */
  findLatestByAssetIds(assetIds: string[]) {
    if (assetIds.length === 0) return Promise.resolve([]);
    return prisma.assetPrice.findMany({
      where: { assetId: { in: assetIds } },
      orderBy: [{ assetId: "asc" }, { date: "desc" }],
      distinct: ["assetId"],
    });
  },

  /**
   * Penúltimo fechamento de cada ativo — base da variação do dia.
   * Ativo com um único candle fica de fora: sem referência anterior não há variação.
   */
  async findPreviousByAssetIds(assetIds: string[]) {
    if (assetIds.length === 0) return [];
    return prisma.$queryRaw<Array<{ assetId: string; close: number }>>`
      SELECT "assetId", close::float8 AS close
      FROM (
        SELECT "assetId", close, ROW_NUMBER() OVER (PARTITION BY "assetId" ORDER BY date DESC) AS rn
        FROM asset_prices
        WHERE "assetId" = ANY(${assetIds})
      ) ranked
      WHERE rn = 2
    `;
  },

  /** Série OHLC completa de um ativo (gráfico de candles). */
  findOhlcByAsset(assetId: string, since?: Date) {
    return prisma.assetPrice.findMany({
      where: { assetId, ...(since ? { date: { gte: since } } : {}) },
      orderBy: { date: "asc" },
      select: { date: true, open: true, high: true, low: true, close: true, volume: true },
    });
  },

  /** Série histórica a partir de uma data (para gráfico de evolução). */
  findHistoryByAssetIds(assetIds: string[], since: Date) {
    if (assetIds.length === 0) return Promise.resolve([]);
    return prisma.assetPrice.findMany({
      where: { assetId: { in: assetIds }, date: { gte: since } },
      orderBy: { date: "asc" },
      select: { assetId: true, date: true, close: true },
    });
  },
};

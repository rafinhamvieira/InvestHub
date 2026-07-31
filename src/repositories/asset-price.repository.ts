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

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Campos gravaveis de um snapshot — subconjunto do modelo AssetFundamental. */
type AssetFundamentalFields = Omit<
  Prisma.AssetFundamentalUncheckedCreateInput,
  "id" | "assetId" | "referenceDate" | "createdAt"
>;

export const assetFundamentalRepository = {
  /**
   * Grava/atualiza o snapshot de indicadores de uma data-base.
   *
   * Só os campos informados são escritos: assim, dados vindos de fontes diferentes
   * (preço do provedor de cotações, indicadores do de fundamentos) se somam no mesmo
   * registro em vez de um sobrescrever o outro com null.
   */
  upsertSnapshot(assetId: string, referenceDate: Date, data: AssetFundamentalFields) {
    const day = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
    );
    return prisma.assetFundamental.upsert({
      where: { assetId_referenceDate: { assetId, referenceDate: day } },
      update: data,
      create: { assetId, referenceDate: day, ...data },
    });
  },

  /**
   * Cria em lote os snapshots do dia vindos do catálogo (preço, valor de mercado,
   * liquidez). Registros já existentes na data são preservados — eles vêm da fonte de
   * fundamentos e são mais completos do que o catálogo.
   */
  createManySnapshots(
    entries: Array<{
      assetId: string;
      price: number | null;
      marketCap: number | null;
      liquidity: number | null;
    }>,
    referenceDate: Date,
  ) {
    if (entries.length === 0) return Promise.resolve({ count: 0 });
    const day = new Date(
      Date.UTC(
        referenceDate.getUTCFullYear(),
        referenceDate.getUTCMonth(),
        referenceDate.getUTCDate(),
      ),
    );

    return prisma.assetFundamental.createMany({
      data: entries.map((entry) => ({
        assetId: entry.assetId,
        referenceDate: day,
        price: entry.price,
        marketCap: entry.marketCap,
        liquidity: entry.liquidity,
      })),
      skipDuplicates: true,
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

import { prisma } from "@/lib/prisma";

/** Registro mínimo usado na deduplicação entre fontes (B3 × Yahoo). */
export interface StoredDividend {
  id: string;
  type: string;
  valuePerShare: number;
  exDate: Date;
  paymentDate: Date | null;
  declaredAt: Date | null;
}

export interface DividendInput {
  type: string;
  valuePerShare: number;
  exDate: Date;
  paymentDate?: Date | null;
  declaredAt?: Date | null;
}

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

  /** Proventos já gravados de um ativo, no formato usado pela deduplicação. */
  async listStored(assetId: string): Promise<StoredDividend[]> {
    const rows = await prisma.assetDividend.findMany({
      where: { assetId },
      select: {
        id: true,
        type: true,
        valuePerShare: true,
        exDate: true,
        paymentDate: true,
        declaredAt: true,
      },
      orderBy: { exDate: "desc" },
    });

    return rows.map((row) => ({ ...row, valuePerShare: Number(row.valuePerShare) }));
  },

  create(assetId: string, event: DividendInput) {
    return prisma.assetDividend.create({
      data: {
        assetId,
        type: event.type,
        valuePerShare: event.valuePerShare,
        exDate: event.exDate,
        paymentDate: event.paymentDate ?? null,
        declaredAt: event.declaredAt ?? null,
      },
    });
  },

  update(id: string, data: Partial<Pick<DividendInput, "type" | "paymentDate" | "declaredAt">>) {
    return prisma.assetDividend.update({ where: { id }, data });
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

  /** Proventos com o cadastro do ativo junto — base da tela de proventos. */
  findWithAssetByAssetIds(assetIds: string[]) {
    if (assetIds.length === 0) return Promise.resolve([]);
    return prisma.assetDividend.findMany({
      where: { assetId: { in: assetIds } },
      include: { asset: { select: { ticker: true, name: true } } },
      orderBy: { exDate: "desc" },
    });
  },

  /** Proventos cuja data de pagamento cai no intervalo — base da notificação de crédito. */
  findPayableBetween(start: Date, end: Date) {
    return prisma.assetDividend.findMany({
      where: { paymentDate: { gte: start, lte: end } },
      include: { asset: { select: { id: true, ticker: true, name: true } } },
      orderBy: { paymentDate: "asc" },
    });
  },

  /**
   * Soma dos proventos por cota dos últimos 12 meses, por ativo.
   * Base do Dividend Yield calculado localmente quando o provedor de fundamentos não
   * cobre o ativo — o histórico de proventos vem de fonte gratuita, o DY dele não.
   */
  async sumLast12mByAsset(assetIds: string[], reference = new Date()): Promise<Map<string, number>> {
    if (assetIds.length === 0) return new Map();

    const since = new Date(reference);
    since.setUTCFullYear(since.getUTCFullYear() - 1);

    const rows = await prisma.assetDividend.groupBy({
      by: ["assetId"],
      where: { assetId: { in: assetIds }, exDate: { gte: since, lte: reference } },
      _sum: { valuePerShare: true },
    });

    return new Map(rows.map((row) => [row.assetId, Number(row._sum.valuePerShare ?? 0)]));
  },

  /** Quando o provento mais recente entrou na base — exibido como "última atualização". */
  async lastImportedAt(assetIds: string[]): Promise<Date | null> {
    if (assetIds.length === 0) return null;
    const latest = await prisma.assetDividend.findFirst({
      where: { assetId: { in: assetIds } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return latest?.createdAt ?? null;
  },
};

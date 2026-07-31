import { transactionRepository } from "@/repositories/transaction.repository";
import { positionRepository } from "@/repositories/position.repository";
import { assetRepository } from "@/repositories/asset.repository";
import { brokerRepository } from "@/repositories/broker.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { computePositions, quantityAt, type LedgerEntry } from "@/utils/portfolio-math";
import type { TransactionInput } from "@/schemas/transaction.schema";
import type { PortfolioData, PositionDTO, TransactionDTO } from "@/types/portfolio";

export class PortfolioError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PortfolioError";
  }
}

function toLedger(
  rows: { assetId: string; type: "BUY" | "SELL"; quantity: unknown; price: unknown; fees: unknown; date: Date }[],
): LedgerEntry[] {
  return rows.map((r) => ({
    assetId: r.assetId,
    type: r.type,
    quantity: Number(r.quantity),
    price: Number(r.price),
    fees: Number(r.fees),
    date: r.date,
  }));
}

/** Recalcula e materializa a posição consolidada de um ativo após qualquer mutação no ledger. */
async function recomputePosition(userId: string, assetId: string): Promise<void> {
  const rows = await transactionRepository.findAllByUserAndAsset(userId, assetId);
  const position = computePositions(toLedger(rows.map((r) => ({ ...r, assetId })))).get(assetId);

  if (!position || position.quantity <= 0) {
    await positionRepository.delete(userId, assetId);
    return;
  }

  await positionRepository.upsert(userId, assetId, {
    quantity: position.quantity,
    averagePrice: position.averagePrice,
    totalInvested: position.totalInvested,
  });
}

/**
 * Valida que uma venda nunca excede a quantidade em custódia na data da venda,
 * considerando todo o ledger exceto a transação em edição (excludeId).
 */
async function assertSellIsValid(
  userId: string,
  assetId: string,
  input: TransactionInput,
  excludeId?: string,
): Promise<void> {
  if (input.type !== "SELL") return;

  const rows = await transactionRepository.findAllByUserAndAsset(userId, assetId);
  const ledger = toLedger(rows.filter((r) => r.id !== excludeId).map((r) => ({ ...r, assetId })));
  const held = quantityAt(ledger, assetId, input.date);

  if (input.quantity > held) {
    throw new PortfolioError(
      "INSUFFICIENT_QUANTITY",
      `Quantidade em custódia na data (${held}) é menor que a quantidade vendida (${input.quantity}).`,
    );
  }
}

async function resolveBrokerId(userId: string, brokerName?: string): Promise<string | null> {
  const name = brokerName?.trim();
  if (!name) return null;
  const broker = await brokerRepository.findOrCreate(userId, name);
  return broker.id;
}

export const portfolioService = {
  async createTransaction(userId: string, input: TransactionInput): Promise<void> {
    const asset = await assetRepository.findOrCreate(input.ticker, input.assetType);
    await assertSellIsValid(userId, asset.id, input);
    const brokerId = await resolveBrokerId(userId, input.brokerName);

    await transactionRepository.create(userId, {
      assetId: asset.id,
      brokerId,
      type: input.type,
      quantity: input.quantity,
      price: input.price,
      fees: input.fees,
      date: input.date,
      notes: input.notes || null,
    });

    await recomputePosition(userId, asset.id);
  },

  async updateTransaction(userId: string, transactionId: string, input: TransactionInput): Promise<void> {
    const existing = await transactionRepository.findByIdAndUser(transactionId, userId);
    if (!existing) throw new PortfolioError("NOT_FOUND", "Transação não encontrada.");

    const asset = await assetRepository.findOrCreate(input.ticker, input.assetType);
    await assertSellIsValid(userId, asset.id, input, transactionId);
    const brokerId = await resolveBrokerId(userId, input.brokerName);

    await transactionRepository.update(transactionId, {
      assetId: asset.id,
      brokerId,
      type: input.type,
      quantity: input.quantity,
      price: input.price,
      fees: input.fees,
      date: input.date,
      notes: input.notes || null,
    });

    await recomputePosition(userId, asset.id);
    if (existing.assetId !== asset.id) {
      await recomputePosition(userId, existing.assetId);
    }
  },

  async deleteTransaction(userId: string, transactionId: string): Promise<void> {
    const existing = await transactionRepository.findByIdAndUser(transactionId, userId);
    if (!existing) throw new PortfolioError("NOT_FOUND", "Transação não encontrada.");

    await transactionRepository.delete(transactionId);
    await recomputePosition(userId, existing.assetId);
  },

  async getPortfolio(userId: string): Promise<PortfolioData> {
    const [transactions, brokers] = await Promise.all([
      transactionRepository.findAllByUser(userId),
      brokerRepository.listByUser(userId),
    ]);

    const ledger = toLedger(transactions);
    const computed = [...computePositions(ledger).values()].filter((p) => p.quantity > 0);

    const assetMeta = new Map(
      transactions.map((t) => [
        t.assetId,
        { ticker: t.asset.ticker, name: t.asset.name, type: t.asset.type, sector: t.asset.sector },
      ]),
    );

    const latestPrices = await assetPriceRepository.findLatestByAssetIds(
      computed.map((p) => p.assetId),
    );
    const priceMap = new Map(latestPrices.map((p) => [p.assetId, Number(p.close)]));

    let totalValue = 0;
    let totalInvested = 0;

    const positions: PositionDTO[] = computed.map((p) => {
      const meta = assetMeta.get(p.assetId)!;
      const currentPrice = priceMap.get(p.assetId) ?? p.averagePrice;
      const currentValue = p.quantity * currentPrice;
      const profit = currentValue - p.totalInvested;
      totalValue += currentValue;
      totalInvested += p.totalInvested;

      return {
        assetId: p.assetId,
        ticker: meta.ticker,
        name: meta.name,
        assetType: meta.type,
        sector: meta.sector,
        quantity: p.quantity,
        averagePrice: p.averagePrice,
        totalInvested: p.totalInvested,
        currentPrice,
        currentValue,
        profit,
        profitPercent: p.totalInvested > 0 ? profit / p.totalInvested : 0,
        weight: 0, // preenchido após o total ser conhecido
      };
    });

    for (const position of positions) {
      position.weight = totalValue > 0 ? position.currentValue / totalValue : 0;
    }
    positions.sort((a, b) => b.currentValue - a.currentValue);

    const listing = await transactionRepository.findAllByUserForListing(userId);
    const transactionDTOs: TransactionDTO[] = listing.map((t) => {
      const quantity = Number(t.quantity);
      const price = Number(t.price);
      const fees = Number(t.fees);
      return {
        id: t.id,
        ticker: t.asset.ticker,
        assetType: t.asset.type,
        type: t.type,
        quantity,
        price,
        fees,
        total: quantity * price + (t.type === "BUY" ? fees : -fees),
        date: t.date.toISOString(),
        brokerName: t.broker?.name ?? null,
        notes: t.notes,
      };
    });

    const profit = totalValue - totalInvested;

    return {
      positions,
      transactions: transactionDTOs,
      totals: {
        totalValue,
        totalInvested,
        profit,
        profitPercent: totalInvested > 0 ? profit / totalInvested : 0,
      },
      brokers: brokers.map((b) => b.name),
    };
  },
};

import { transactionRepository } from "@/repositories/transaction.repository";
import { positionRepository } from "@/repositories/position.repository";
import { assetRepository } from "@/repositories/asset.repository";
import { brokerRepository } from "@/repositories/broker.repository";
import { assetPriceRepository } from "@/repositories/asset-price.repository";
import { fixedIncomeRepository } from "@/repositories/fixed-income.repository";
import { allocationTargetRepository } from "@/repositories/allocation-target.repository";
import { fixedIncomeService } from "@/services/fixed-income.service";
import { computePositions, quantityAt, type LedgerEntry } from "@/utils/portfolio-math";
import { describeRemuneration } from "@/utils/fixed-income-math";
import { ASSET_CLASS_LABELS } from "@/constants/asset";
import { isFixedIncomeType, type TransactionInput } from "@/schemas/transaction.schema";
import type {
  FixedIncomeDTO,
  PortfolioData,
  PortfolioGroup,
  PositionDTO,
  TransactionDTO,
} from "@/types/portfolio";
import type { AssetType } from "@prisma/client";

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
  sale: { type: "BUY" | "SELL"; date: Date; quantity: number },
  excludeId?: string,
): Promise<void> {
  if (sale.type !== "SELL") return;

  const rows = await transactionRepository.findAllByUserAndAsset(userId, assetId);
  const ledger = toLedger(rows.filter((r) => r.id !== excludeId).map((r) => ({ ...r, assetId })));
  const held = quantityAt(ledger, assetId, sale.date);

  if (sale.quantity > held) {
    throw new PortfolioError(
      "INSUFFICIENT_QUANTITY",
      `Quantidade em custódia na data (${held}) é menor que a quantidade vendida (${sale.quantity}).`,
    );
  }
}

async function resolveBrokerId(userId: string, brokerName?: string): Promise<string | null> {
  const name = brokerName?.trim();
  if (!name) return null;
  const broker = await brokerRepository.findOrCreate(userId, name);
  return broker.id;
}

/**
 * Traduz o lançamento para o par quantidade/preço que o ledger entende.
 *
 * Em renda variável isso já vem digitado. Em renda fixa o usuário informa quanto aplicou:
 * o preço é o valor unitário do título na data (1,00 na emissão, corrigido pela curva do
 * indexador) e a quantidade é o quociente. Assim uma aplicação de R$ 5.000 num CDB que já
 * rendeu 20% entra com a quantidade certa e continua valorizando junto com o índice.
 */
async function resolveAssetAndAmounts(
  input: TransactionInput,
): Promise<{ assetId: string; quantity: number; price: number }> {
  if (!isFixedIncomeType(input.assetType) || !input.fixedIncome) {
    const asset = await assetRepository.findOrCreate(input.ticker!, input.assetType);
    return { assetId: asset.id, quantity: input.quantity!, price: input.price! };
  }

  const terms = input.fixedIncome;
  const asset = await fixedIncomeService.registerInstrument(
    {
      name: terms.name,
      assetType: input.assetType as "TREASURY" | "FIXED_INCOME",
      issuer: terms.issuer || null,
      indexer: terms.indexer,
      indexPercent: terms.indexPercent ?? null,
      spreadPercent: terms.spreadPercent ?? null,
      maturityDate: terms.maturityDate ?? null,
    },
    input.date,
  );

  const unitValue = await fixedIncomeService.getUnitValue(asset.id, input.date);
  return { assetId: asset.id, quantity: terms.amount / unitValue, price: unitValue };
}

/**
 * Agrupa as posições por classe, com os totais que a tela mostra em cada cabeçalho.
 *
 * A variação do dia sai da comparação com o fechamento anterior; ativo sem cotação de
 * ontem (renda fixa recém-lançada, papel sem negócio) fica de fora do cálculo em vez de
 * entrar como 0% e diluir o número do grupo.
 */
function buildGroups(
  positions: PositionDTO[],
  previousMap: Map<string, number>,
  priceMap: Map<string, number>,
  totalValue: number,
  targets: Array<{ level: string; label: string; targetPercent: unknown }>,
): PortfolioGroup[] {
  const targetByClass = new Map(
    targets
      .filter((target) => target.level === "CLASS")
      .map((target) => [target.label, Number(target.targetPercent) / 100]),
  );

  const byType = new Map<AssetType, PositionDTO[]>();
  for (const position of positions) {
    const list = byType.get(position.assetType) ?? [];
    list.push(position);
    byType.set(position.assetType, list);
  }

  return [...byType.entries()]
    .map(([assetType, groupPositions]) => {
      const totalGroupValue = groupPositions.reduce((sum, p) => sum + p.currentValue, 0);
      const totalGroupInvested = groupPositions.reduce((sum, p) => sum + p.totalInvested, 0);

      let valueYesterday = 0;
      let valueToday = 0;
      for (const position of groupPositions) {
        const previous = previousMap.get(position.assetId);
        const current = priceMap.get(position.assetId);
        if (previous === undefined || current === undefined || previous <= 0) continue;
        valueYesterday += position.quantity * previous;
        valueToday += position.quantity * current;
      }

      const profit = totalGroupValue - totalGroupInvested;

      return {
        assetType,
        label: ASSET_CLASS_LABELS[assetType],
        positions: groupPositions,
        totalValue: totalGroupValue,
        totalInvested: totalGroupInvested,
        profit,
        profitPercent: totalGroupInvested > 0 ? profit / totalGroupInvested : 0,
        dayChange: valueYesterday > 0 ? valueToday / valueYesterday - 1 : null,
        weight: totalValue > 0 ? totalGroupValue / totalValue : 0,
        target: targetByClass.get(assetType) ?? null,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

export const portfolioService = {
  async createTransaction(userId: string, input: TransactionInput): Promise<void> {
    const { assetId, quantity, price } = await resolveAssetAndAmounts(input);
    await assertSellIsValid(userId, assetId, { type: input.type, date: input.date, quantity });
    const brokerId = await resolveBrokerId(userId, input.brokerName);

    await transactionRepository.create(userId, {
      assetId,
      brokerId,
      type: input.type,
      quantity,
      price,
      fees: input.fees,
      date: input.date,
      notes: input.notes || null,
    });

    await recomputePosition(userId, assetId);
    if (isFixedIncomeType(input.assetType)) await fixedIncomeService.syncPrices();
  },

  async updateTransaction(userId: string, transactionId: string, input: TransactionInput): Promise<void> {
    const existing = await transactionRepository.findByIdAndUser(transactionId, userId);
    if (!existing) throw new PortfolioError("NOT_FOUND", "Transação não encontrada.");

    const { assetId, quantity, price } = await resolveAssetAndAmounts(input);
    await assertSellIsValid(userId, assetId, { type: input.type, date: input.date, quantity }, transactionId);
    const brokerId = await resolveBrokerId(userId, input.brokerName);

    await transactionRepository.update(transactionId, {
      assetId,
      brokerId,
      type: input.type,
      quantity,
      price,
      fees: input.fees,
      date: input.date,
      notes: input.notes || null,
    });

    await recomputePosition(userId, assetId);
    if (existing.assetId !== assetId) {
      await recomputePosition(userId, existing.assetId);
    }
    if (isFixedIncomeType(input.assetType)) await fixedIncomeService.syncPrices();
  },

  /**
   * Baixa um título de renda fixa: registra a venda da posição inteira pelo valor do dia
   * (ou do vencimento, se já passou) e zera o papel na carteira.
   *
   * Fica como ação explícita porque resgate é decisão: o título pode ter sido renovado,
   * levado para outra corretora ou resgatado antes da hora. O que o sistema faz é poupar a
   * conta — o valor corrigido já está calculado.
   */
  async redeemFixedIncome(userId: string, assetId: string): Promise<void> {
    const position = await positionRepository.findByUserAndAsset(userId, assetId);
    if (!position || Number(position.quantity) <= 0) {
      throw new PortfolioError("NOT_FOUND", "Título não encontrado na carteira.");
    }

    const terms = await fixedIncomeRepository.findByAsset(assetId);
    if (!terms) {
      throw new PortfolioError("NOT_FIXED_INCOME", "Este ativo não é um título de renda fixa.");
    }

    const today = new Date();
    const settlement =
      terms.maturityDate && terms.maturityDate < today ? terms.maturityDate : today;
    const unitValue = await fixedIncomeService.getUnitValue(assetId, settlement);

    await transactionRepository.create(userId, {
      assetId,
      brokerId: null,
      type: "SELL",
      quantity: Number(position.quantity),
      price: unitValue,
      fees: 0,
      date: settlement,
      notes: "Resgate registrado automaticamente.",
    });

    await recomputePosition(userId, assetId);
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

    const assetIds = computed.map((p) => p.assetId);
    const [latestPrices, previousPrices, fixedIncomeTerms, targets] = await Promise.all([
      assetPriceRepository.findLatestByAssetIds(assetIds),
      assetPriceRepository.findPreviousByAssetIds(assetIds),
      fixedIncomeRepository.findByAssetIds([...assetMeta.keys()]),
      allocationTargetRepository.findAllByUser(userId),
    ]);
    const priceMap = new Map(latestPrices.map((p) => [p.assetId, Number(p.close)]));
    const previousMap = new Map(previousPrices.map((p) => [p.assetId, Number(p.close)]));
    const termsMap = new Map(fixedIncomeTerms.map((terms) => [terms.assetId, terms]));

    const toFixedIncomeDTO = (assetId: string, name: string): FixedIncomeDTO | null => {
      const terms = termsMap.get(assetId);
      if (!terms) return null;

      const indexPercent = terms.indexPercent === null ? null : Number(terms.indexPercent);
      const spreadPercent = terms.spreadPercent === null ? null : Number(terms.spreadPercent);

      return {
        name,
        issuer: terms.issuer ?? "",
        indexer: terms.indexer,
        indexPercent: indexPercent === null ? "" : String(indexPercent),
        spreadPercent: spreadPercent === null ? "" : String(spreadPercent),
        maturityDate: terms.maturityDate ? terms.maturityDate.toISOString().slice(0, 10) : "",
        remuneration: describeRemuneration({
          indexer: terms.indexer,
          indexPercent,
          spreadPercent,
          startDate: terms.startDate,
        }),
      };
    };

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
        fixedIncome: toFixedIncomeDTO(p.assetId, meta.name),
      };
    });

    for (const position of positions) {
      position.weight = totalValue > 0 ? position.currentValue / totalValue : 0;
    }
    positions.sort((a, b) => b.currentValue - a.currentValue);

    const groups = buildGroups(positions, previousMap, priceMap, totalValue, targets);

    const listing = await transactionRepository.findAllByUserForListing(userId);
    const transactionDTOs: TransactionDTO[] = listing.map((t) => {
      const quantity = Number(t.quantity);
      const price = Number(t.price);
      const fees = Number(t.fees);
      return {
        id: t.id,
        ticker: t.asset.ticker,
        name: t.asset.name,
        assetType: t.asset.type,
        fixedIncome: toFixedIncomeDTO(t.assetId, t.asset.name),
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
      groups,
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

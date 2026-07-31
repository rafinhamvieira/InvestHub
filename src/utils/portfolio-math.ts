/**
 * Funções puras de cálculo de carteira a partir do ledger de transações.
 * Método de custo: preço médio ponderado (vendas saem pelo preço médio vigente).
 * Sem I/O — recebem dados prontos e devolvem resultados; testáveis isoladamente.
 */

export interface LedgerEntry {
  assetId: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  fees: number;
  date: Date;
}

export interface ComputedPosition {
  assetId: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
}

/** Consolida posições até uma data (inclusive). Transações futuras à data são ignoradas. */
export function computePositionsAt(entries: LedgerEntry[], at: Date): Map<string, ComputedPosition> {
  const sorted = [...entries]
    .filter((entry) => entry.date <= at)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const positions = new Map<string, ComputedPosition>();

  for (const entry of sorted) {
    const current = positions.get(entry.assetId) ?? {
      assetId: entry.assetId,
      quantity: 0,
      averagePrice: 0,
      totalInvested: 0,
    };

    if (entry.type === "BUY") {
      const cost = entry.quantity * entry.price + entry.fees;
      const newQuantity = current.quantity + entry.quantity;
      current.totalInvested = current.totalInvested + cost;
      current.averagePrice = newQuantity > 0 ? current.totalInvested / newQuantity : 0;
      current.quantity = newQuantity;
    } else {
      const soldQuantity = Math.min(entry.quantity, current.quantity);
      current.totalInvested -= soldQuantity * current.averagePrice;
      current.quantity -= soldQuantity;
      if (current.quantity <= 0) {
        current.quantity = 0;
        current.totalInvested = 0;
        current.averagePrice = 0;
      }
    }

    positions.set(entry.assetId, current);
  }

  return positions;
}

export function computePositions(entries: LedgerEntry[]): Map<string, ComputedPosition> {
  return computePositionsAt(entries, new Date());
}

/** Quantidade de um ativo em uma data específica (para cálculo de dividendos na data ex). */
export function quantityAt(entries: LedgerEntry[], assetId: string, at: Date): number {
  return computePositionsAt(entries, at).get(assetId)?.quantity ?? 0;
}

/** Últimos N meses como datas de fim de mês, do mais antigo ao mais recente (inclui mês corrente). */
export function lastMonthEnds(months: number, reference = new Date()): Date[] {
  const result: Date[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const end = new Date(reference.getFullYear(), reference.getMonth() - i + 1, 0, 23, 59, 59, 999);
    result.push(end);
  }
  return result;
}

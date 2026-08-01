/**
 * Cálculo de proventos a partir do ledger — puro, sem I/O.
 *
 * Duas regras dão o tom de tudo aqui:
 *
 *  - **Quantidade é a da data-com**, não a de hoje. Quem vendeu depois da data-com ainda
 *    recebe; quem comprou depois, não. Usar a posição atual inflaria o histórico a cada
 *    novo aporte e faria o "recebido em 2024" mudar sozinho.
 *  - **O provento entra no mês do pagamento**, não no da data-com. É quando o dinheiro
 *    cai na conta, e é assim que o extrato da corretora mostra.
 */

import { quantityAt, type LedgerEntry } from "@/utils/portfolio-math";
import { toUtcDateOnly } from "@/utils/date";
import type {
  DividendAssetSummary,
  DividendEvent,
  DividendMonthPoint,
  DividendRow,
  DividendYearPoint,
  PeriodTotals,
} from "@/types/dividends";

export interface KnownDividend {
  exDate: Date;
  valuePerShare: number;
}

/** Tolerância ao cruzar fontes diferentes: mesma janela de dias e valor equivalente. */
const DUPLICATE_DAY_TOLERANCE = 4;
const DUPLICATE_VALUE_TOLERANCE = 0.05;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * O provento já existe na base, vindo de outra fonte?
 *
 * B3 e Yahoo descrevem o mesmo evento com pequenas diferenças: a data-com pode variar um
 * dia (feriado, conversão de fuso) e o valor difere na casa decimal quando o Yahoo ajusta
 * por desdobramento. Comparação exata duplicaria metade do histórico.
 */
export function findDuplicate<T extends KnownDividend>(
  known: T[],
  candidate: KnownDividend,
): T | null {
  for (const item of known) {
    const days = Math.abs(item.exDate.getTime() - candidate.exDate.getTime()) / DAY_MS;
    if (days > DUPLICATE_DAY_TOLERANCE) continue;

    const reference = Math.max(item.valuePerShare, candidate.valuePerShare);
    if (reference <= 0) continue;
    const difference = Math.abs(item.valuePerShare - candidate.valuePerShare) / reference;
    if (difference <= DUPLICATE_VALUE_TOLERANCE) return item;
  }
  return null;
}

function monthKey(date: Date): string {
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function monthsAgo(reference: Date, months: number): Date {
  const date = toUtcDateOnly(reference);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

/**
 * Cruza proventos com a custódia do usuário.
 *
 * `received` são os de data-com passada — quantidade travada pelo ledger. `upcoming` são
 * os anunciados que ainda não foram pagos; quando a data-com também está no futuro, a
 * quantidade é a posição de hoje e vem marcada como estimativa.
 */
export function buildDividendRows(
  events: DividendEvent[],
  ledger: LedgerEntry[],
  reference = new Date(),
): { received: DividendRow[]; upcoming: DividendRow[] } {
  const received: DividendRow[] = [];
  const upcoming: DividendRow[] = [];

  for (const event of events) {
    const exDate = new Date(event.exDate);
    const paymentDate = event.paymentDate ? new Date(event.paymentDate) : null;
    const estimated = exDate > reference;

    const quantity = quantityAt(ledger, event.assetId, estimated ? reference : exDate);
    if (quantity <= 0) continue;

    const row: DividendRow = {
      ...event,
      quantity,
      total: quantity * event.valuePerShare,
      effectiveDate: (paymentDate ?? exDate).toISOString(),
      estimated,
    };

    // Pendente = ainda não pagou. Sem data de pagamento, a data-com decide.
    const settled = paymentDate ? paymentDate <= reference : exDate <= reference;
    if (settled) received.push(row);
    else upcoming.push(row);
  }

  received.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  upcoming.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  return { received, upcoming };
}

function sumSince(rows: DividendRow[], since: Date): number {
  return rows.reduce((sum, row) => (new Date(row.effectiveDate) >= since ? sum + row.total : sum), 0);
}

export function computeTotals(rows: DividendRow[], reference = new Date()): PeriodTotals {
  return {
    last12m: sumSince(rows, monthsAgo(reference, 12)),
    last24m: sumSince(rows, monthsAgo(reference, 24)),
    last60m: sumSince(rows, monthsAgo(reference, 60)),
    allTime: rows.reduce((sum, row) => sum + row.total, 0),
  };
}

/** Série mensal dos últimos N meses, do mais antigo ao mais recente (meses sem provento = 0). */
export function groupByMonth(
  rows: DividendRow[],
  months: number,
  reference = new Date(),
): DividendMonthPoint[] {
  const totals = new Map<string, number>();
  const cursor = toUtcDateOnly(reference);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - (months - 1));

  const order: string[] = [];
  for (let i = 0; i < months; i++) {
    const key = monthKey(cursor);
    order.push(key);
    totals.set(key, 0);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  for (const row of rows) {
    const key = monthKey(new Date(row.effectiveDate));
    if (totals.has(key)) totals.set(key, totals.get(key)! + row.total);
  }

  return order.map((label) => ({ label, total: totals.get(label) ?? 0 }));
}

export function groupByYear(rows: DividendRow[]): DividendYearPoint[] {
  const totals = new Map<number, number>();
  for (const row of rows) {
    const year = new Date(row.effectiveDate).getUTCFullYear();
    totals.set(year, (totals.get(year) ?? 0) + row.total);
  }
  return [...totals.entries()]
    .map(([year, total]) => ({ year, total }))
    .sort((a, b) => b.year - a.year);
}

/**
 * Resumo por ativo no período. `costByAsset` é o valor investido na posição atual e serve
 * para o yield on cost — ativo já vendido fica sem o indicador, não com yield infinito.
 */
export function groupByAsset(
  rows: DividendRow[],
  costByAsset: Map<string, number> = new Map(),
): DividendAssetSummary[] {
  const summaries = new Map<string, DividendAssetSummary>();

  for (const row of rows) {
    const current = summaries.get(row.assetId) ?? {
      assetId: row.assetId,
      ticker: row.ticker,
      name: row.name,
      total: 0,
      events: 0,
      lastPayment: null as string | null,
      yieldOnCost: null as number | null,
    };

    current.total += row.total;
    current.events += 1;
    if (!current.lastPayment || row.effectiveDate > current.lastPayment) {
      current.lastPayment = row.effectiveDate;
    }
    summaries.set(row.assetId, current);
  }

  for (const summary of summaries.values()) {
    const cost = costByAsset.get(summary.assetId) ?? 0;
    summary.yieldOnCost = cost > 0 ? summary.total / cost : null;
  }

  return [...summaries.values()].sort((a, b) => b.total - a.total);
}

/** Filtra as linhas dentro de uma janela em meses. `null` = tudo. */
export function filterByPeriod(
  rows: DividendRow[],
  months: number | null,
  reference = new Date(),
): DividendRow[] {
  if (months === null) return rows;
  const since = monthsAgo(reference, months);
  return rows.filter((row) => new Date(row.effectiveDate) >= since);
}

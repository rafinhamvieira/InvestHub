/**
 * Correção de títulos de renda fixa — puro, sem I/O.
 *
 * Renda fixa não tem cotação: o valor de hoje é o valor aplicado corrigido pelo indexador
 * desde a emissão. Para o resto do sistema continuar tratando tudo como "quantidade ×
 * preço", o motor produz um **valor unitário sintético**: 1,00 na data de início do papel,
 * corrigido dia a dia daí em diante. A compra vira `quantidade = valor aplicado / valor
 * unitário na data`, e posição, patrimônio e evolução seguem funcionando sem saber que
 * aquele preço não veio da bolsa.
 *
 * Convenções do mercado brasileiro seguidas aqui:
 *  - pós-fixado (CDI/Selic) capitaliza **por dia útil**, aplicando o percentual contratado
 *    sobre a taxa do dia — 110% do CDI é `1 + taxa_do_dia × 1,10`, não o fator elevado a 1,1;
 *  - prefixado e juro real usam base **252 dias úteis**;
 *  - IPCA corrige pelo índice do mês fechado e o spread roda por dias úteis em cima.
 *
 * Simplificações assumidas, ambas conservadoras para exibição de carteira: feriados
 * bancários não são descontados (só fim de semana), e o IPCA não é projetado no mês
 * corrente — entra quando o IBGE divulga.
 */

export type Indexer = "SELIC" | "CDI" | "IPCA" | "PREFIXADO";

/** Taxa diária do índice, em percentual ao dia, como o Banco Central publica. */
export interface DailyRate {
  date: Date;
  rate: number;
}

/** Variação mensal do índice, em percentual ao mês. */
export interface MonthlyRate {
  date: Date;
  rate: number;
}

export interface FixedIncomeCurve {
  /** Série diária do indexador pós-fixado (CDI ou Selic). */
  daily: DailyRate[];
  /** Série mensal do IPCA. */
  monthlyIpca: MonthlyRate[];
}

export interface FixedIncomeTermsInput {
  indexer: Indexer;
  /** Percentual do índice: 110 = 110% do CDI. */
  indexPercent: number | null;
  /** Spread anual em pontos percentuais (IPCA + 6,00) ou taxa cheia do prefixado. */
  spreadPercent: number | null;
  startDate: Date;
}

const BUSINESS_DAYS_PER_YEAR = 252;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

/** Dias úteis no intervalo (from, to] — a data inicial não rende. */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  if (end <= start) return 0;

  let count = 0;
  for (let time = start.getTime() + DAY_MS; time <= end.getTime(); time += DAY_MS) {
    if (isBusinessDay(new Date(time))) count++;
  }
  return count;
}

/**
 * Fator acumulado de um pós-fixado entre duas datas.
 * O percentual contratado incide sobre a taxa de cada dia, não sobre o fator final.
 */
export function accumulateDaily(
  series: DailyRate[],
  from: Date,
  to: Date,
  percentOfIndex: number,
): number {
  const start = startOfUtcDay(from).getTime();
  const end = startOfUtcDay(to).getTime();

  let factor = 1;
  for (const point of series) {
    const time = startOfUtcDay(point.date).getTime();
    if (time <= start || time > end) continue;
    factor *= 1 + (point.rate / 100) * percentOfIndex;
  }
  return factor;
}

/**
 * Fator do IPCA entre duas datas, pelos meses já divulgados.
 * Meses parciais nas pontas não são rateados: o índice só entra quando fecha.
 */
export function accumulateMonthly(series: MonthlyRate[], from: Date, to: Date): number {
  const start = startOfUtcDay(from).getTime();
  const end = startOfUtcDay(to).getTime();

  let factor = 1;
  for (const point of series) {
    const time = startOfUtcDay(point.date).getTime();
    if (time <= start || time > end) continue;
    factor *= 1 + point.rate / 100;
  }
  return factor;
}

/** Juro anual convertido para o período, na base 252 dias úteis. */
export function annualToPeriod(annualPercent: number, businessDays: number): number {
  if (annualPercent === 0 || businessDays <= 0) return 1;
  return (1 + annualPercent / 100) ** (businessDays / BUSINESS_DAYS_PER_YEAR);
}

/**
 * Valor unitário do título na data pedida — 1,00 no início da curva.
 *
 * Sem série disponível o fator do índice fica em 1: o título aparece pelo valor aplicado
 * em vez de sumir ou inventar rendimento.
 */
export function unitValueAt(
  terms: FixedIncomeTermsInput,
  curve: FixedIncomeCurve,
  at: Date,
): number {
  const start = startOfUtcDay(terms.startDate);
  const target = startOfUtcDay(at);
  if (target <= start) return 1;

  const businessDays = businessDaysBetween(start, target);
  const spread = terms.spreadPercent ?? 0;

  switch (terms.indexer) {
    case "PREFIXADO":
      return annualToPeriod(spread, businessDays);

    case "IPCA": {
      const inflation = accumulateMonthly(curve.monthlyIpca, start, target);
      return inflation * annualToPeriod(spread, businessDays);
    }

    case "CDI":
    case "SELIC": {
      const percent = (terms.indexPercent ?? 100) / 100;
      const index = accumulateDaily(curve.daily, start, target, percent);
      return index * annualToPeriod(spread, businessDays);
    }
  }
}

/** Rótulo curto da remuneração: "110% do CDI", "IPCA + 6,00% a.a.", "12,50% a.a.". */
export function describeRemuneration(terms: FixedIncomeTermsInput): string {
  const spread = terms.spreadPercent ?? 0;
  const percent = terms.indexPercent ?? 100;
  const spreadLabel = `${spread.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.`;

  switch (terms.indexer) {
    case "PREFIXADO":
      return spreadLabel;
    case "IPCA":
      return `IPCA + ${spreadLabel}`;
    case "CDI":
    case "SELIC": {
      const index = terms.indexer === "CDI" ? "CDI" : "Selic";
      const base = `${percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do ${index}`;
      return spread > 0 ? `${index} + ${spreadLabel}` : base;
    }
  }
}

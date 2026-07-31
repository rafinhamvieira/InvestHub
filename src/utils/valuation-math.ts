/**
 * Cálculos de valuation puros. Reutilizados pelo motor de aporte e pela fase de Valuation.
 * Todos os percentuais são frações (0.08 = 8%).
 */

/** Preço justo de Graham: sqrt(multiplicador * LPA * VPA). Padrão 22.5 (P/L 15 × P/VP 1.5). */
export function grahamFairPrice(lpa: number, vpa: number, multiplier = 22.5): number | null {
  if (lpa <= 0 || vpa <= 0) return null;
  return Math.sqrt(multiplier * lpa * vpa);
}

/** Preço teto de Bazin: dividendos anuais por cota / yield mínimo desejado (padrão 6%). */
export function bazinCeilingPrice(annualDividendsPerShare: number, minYield = 0.06): number | null {
  if (annualDividendsPerShare <= 0 || minYield <= 0) return null;
  return annualDividendsPerShare / minYield;
}

/** LPA derivado de preço e P/L. */
export function lpaFromPl(price: number, pl: number): number | null {
  if (price <= 0 || pl === 0) return null;
  return price / pl;
}

/** VPA derivado de preço e P/VP. */
export function vpaFromPvp(price: number, pvp: number): number | null {
  if (price <= 0 || pvp === 0) return null;
  return price / pvp;
}

/** Margem de segurança: quão abaixo do preço justo está o preço atual. Positiva = barato. */
export function safetyMargin(price: number, fairPrice: number): number | null {
  if (price <= 0 || fairPrice <= 0) return null;
  return (fairPrice - price) / fairPrice;
}

/**
 * Preço justo de Peter Lynch: P/L justo = taxa de crescimento dos lucros (PEG = 1).
 * fair = LPA × crescimento%. Crescimento limitado a [0, 25] — Lynch desconfiava de
 * taxas acima disso como insustentáveis.
 */
export function lynchFairPrice(lpa: number, growthFraction: number): number | null {
  if (lpa <= 0 || growthFraction <= 0) return null;
  const growthPercent = Math.min(growthFraction * 100, 25);
  return lpa * growthPercent;
}

export interface DcfInput {
  /** Fluxo por ação do ano base (proxy: LPA quando não há FCF). */
  baseCashflow: number;
  /** Crescimento anual na fase explícita (fração). */
  growthRate: number;
  /** Taxa de desconto anual (fração). */
  discountRate: number;
  /** Crescimento na perpetuidade (fração, menor que a taxa de desconto). */
  perpetuityGrowthRate: number;
  /** Anos da fase explícita. */
  projectionYears: number;
}

/**
 * Fluxo de Caixa Descontado (modelo de 2 estágios por ação):
 * soma dos fluxos projetados descontados + valor terminal de Gordon descontado.
 */
export function dcfFairPrice(input: DcfInput): number | null {
  const { baseCashflow, growthRate, discountRate, perpetuityGrowthRate, projectionYears } = input;
  if (baseCashflow <= 0 || projectionYears <= 0) return null;
  if (discountRate <= perpetuityGrowthRate) return null;

  let presentValue = 0;
  let cashflow = baseCashflow;
  for (let year = 1; year <= projectionYears; year++) {
    cashflow *= 1 + growthRate;
    presentValue += cashflow / Math.pow(1 + discountRate, year);
  }

  const terminal =
    (cashflow * (1 + perpetuityGrowthRate)) / (discountRate - perpetuityGrowthRate);
  presentValue += terminal / Math.pow(1 + discountRate, projectionYears);

  return presentValue;
}

/** Earnings Yield de Greenblatt: EBIT/EV, aproximado por 1/(EV/EBIT). */
export function earningsYield(evEbit: number): number | null {
  if (evEbit <= 0) return null;
  return 1 / evEbit;
}

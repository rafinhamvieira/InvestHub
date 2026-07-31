/**
 * Motor do Score Inteligente — puro, sem I/O.
 *
 * Cada critério vira uma nota 0–1 por saturação (limites onde a nota satura em 0 ou 1).
 * A nota final é a média ponderada apenas dos critérios com dados disponíveis, renormalizada
 * pelos pesos efetivos — assim um ativo sem certos indicadores não é punido, mas o campo
 * `coverage` indica quanto da nota foi de fato avaliado.
 */

import { grahamFairPrice, bazinCeilingPrice, lpaFromPl, vpaFromPvp } from "@/utils/valuation-math";
import type {
  AssetScore,
  CriterionBreakdown,
  ScoreCriterionKey,
  ScoreRating,
  ScoreWeights,
} from "@/types/score";

export interface ScoreInput {
  price: number | null;
  pl: number | null;
  pvp: number | null;
  /** DY anual em percentual (8.5 = 8.5%). */
  dividendYield: number | null;
  /** ROE em percentual. */
  roe: number | null;
  /** Margem líquida em percentual. */
  netMargin: number | null;
  /** Margem EBITDA em percentual. */
  ebitdaMargin: number | null;
  /** Dívida líquida / EBITDA. */
  netDebtEbitda: number | null;
  /** Liquidez média diária em R$. */
  liquidity: number | null;
  /** Tag along em percentual. */
  tagAlong: number | null;
  /** Free float em percentual. */
  freeFloat: number | null;
  /** Quantos dos últimos 5 anos tiveram pagamento de proventos. */
  dividendYears: number | null;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  valuation: 20,
  dividendYield: 15,
  pl: 10,
  roe: 15,
  margins: 10,
  debt: 10,
  priceSafetyMargin: 10,
  dividendHistory: 5,
  liquidity: 3,
  governance: 2,
};

export const CRITERION_LABELS: Record<ScoreCriterionKey, string> = {
  valuation: "Valuation (preço justo)",
  dividendYield: "Dividend Yield",
  pl: "P/L",
  roe: "ROE",
  margins: "Margens",
  debt: "Endividamento",
  priceSafetyMargin: "Margem de segurança",
  dividendHistory: "Histórico de dividendos",
  liquidity: "Liquidez",
  governance: "Governança",
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Nota crescente: `low` ou menos → 0, `high` ou mais → 1. */
function scaleUp(value: number, low: number, high: number): number {
  return clamp01((value - low) / (high - low));
}

/** Nota decrescente: `best` ou menos → 1, `worst` ou mais → 0. */
function scaleDown(value: number, best: number, worst: number): number {
  return clamp01((worst - value) / (worst - best));
}

function fmt(value: number, digits = 1): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

interface CriterionResult {
  score: number | null;
  explanation: string;
}

function evaluateValuation(input: ScoreInput): CriterionResult {
  const { price, pl, pvp } = input;
  if (price === null || price <= 0 || pl === null || pvp === null) {
    return { score: null, explanation: "Sem P/L ou P/VP para calcular o preço justo." };
  }

  const lpa = lpaFromPl(price, pl);
  const vpa = vpaFromPvp(price, pvp);
  const fair = lpa !== null && vpa !== null ? grahamFairPrice(lpa, vpa) : null;

  if (fair === null) {
    return { score: null, explanation: "Lucro ou patrimônio negativo impede o cálculo de Graham." };
  }

  const margin = (fair - price) / fair;
  return {
    score: scaleUp(margin, -0.3, 0.3),
    explanation:
      margin >= 0
        ? `Preço ${fmt(margin * 100)}% abaixo do justo de Graham (R$ ${fmt(fair, 2)}).`
        : `Preço ${fmt(Math.abs(margin) * 100)}% acima do justo de Graham (R$ ${fmt(fair, 2)}).`,
  };
}

function evaluateSafetyMargin(input: ScoreInput): CriterionResult {
  const { price, dividendYield } = input;
  if (price === null || price <= 0 || dividendYield === null || dividendYield <= 0) {
    return { score: null, explanation: "Sem proventos conhecidos para calcular o preço teto." };
  }

  const ceiling = bazinCeilingPrice((dividendYield / 100) * price);
  if (ceiling === null) {
    return { score: null, explanation: "Não foi possível calcular o preço teto de Bazin." };
  }

  const margin = (ceiling - price) / ceiling;
  return {
    score: scaleUp(margin, -0.3, 0.3),
    explanation:
      margin >= 0
        ? `Cotação ${fmt(margin * 100)}% abaixo do teto de Bazin (R$ ${fmt(ceiling, 2)}).`
        : `Cotação ${fmt(Math.abs(margin) * 100)}% acima do teto de Bazin (R$ ${fmt(ceiling, 2)}).`,
  };
}

function evaluateDividendYield(input: ScoreInput): CriterionResult {
  if (input.dividendYield === null) {
    return { score: null, explanation: "Dividend Yield não informado." };
  }
  const dy = input.dividendYield;
  return {
    score: scaleUp(dy, 0, 12),
    explanation:
      dy >= 8
        ? `DY de ${fmt(dy)}% ao ano — pagamento forte.`
        : dy >= 4
          ? `DY de ${fmt(dy)}% ao ano — pagamento moderado.`
          : `DY de ${fmt(dy)}% ao ano — pagamento baixo.`,
  };
}

function evaluatePl(input: ScoreInput): CriterionResult {
  if (input.pl === null) return { score: null, explanation: "P/L não informado." };
  if (input.pl <= 0) {
    return { score: 0, explanation: `P/L de ${fmt(input.pl)} — empresa com prejuízo.` };
  }
  return {
    score: scaleDown(input.pl, 5, 25),
    explanation:
      input.pl <= 10
        ? `P/L de ${fmt(input.pl)} — múltiplo baixo frente ao lucro.`
        : `P/L de ${fmt(input.pl)} — múltiplo elevado frente ao lucro.`,
  };
}

function evaluateRoe(input: ScoreInput): CriterionResult {
  if (input.roe === null) return { score: null, explanation: "ROE não informado." };
  return {
    score: scaleUp(input.roe, 0, 25),
    explanation:
      input.roe >= 15
        ? `ROE de ${fmt(input.roe)}% — bom retorno sobre o patrimônio.`
        : `ROE de ${fmt(input.roe)}% — retorno sobre o patrimônio modesto.`,
  };
}

function evaluateMargins(input: ScoreInput): CriterionResult {
  const parts: number[] = [];
  const texts: string[] = [];

  if (input.netMargin !== null) {
    parts.push(scaleUp(input.netMargin, 0, 20));
    texts.push(`margem líquida de ${fmt(input.netMargin)}%`);
  }
  if (input.ebitdaMargin !== null) {
    parts.push(scaleUp(input.ebitdaMargin, 0, 30));
    texts.push(`margem EBITDA de ${fmt(input.ebitdaMargin)}%`);
  }

  if (parts.length === 0) return { score: null, explanation: "Margens não informadas." };

  return {
    score: parts.reduce((sum, p) => sum + p, 0) / parts.length,
    explanation: `Rentabilidade operacional com ${texts.join(" e ")}.`,
  };
}

function evaluateDebt(input: ScoreInput): CriterionResult {
  if (input.netDebtEbitda === null) {
    return { score: null, explanation: "Dívida líquida/EBITDA não informada." };
  }
  const ratio = input.netDebtEbitda;
  return {
    score: scaleDown(ratio, 0, 3.5),
    explanation:
      ratio <= 0
        ? "Caixa líquido — a empresa tem mais caixa do que dívida."
        : ratio <= 2
          ? `Dívida líquida de ${fmt(ratio)}x o EBITDA — alavancagem controlada.`
          : `Dívida líquida de ${fmt(ratio)}x o EBITDA — alavancagem elevada.`,
  };
}

function evaluateDividendHistory(input: ScoreInput): CriterionResult {
  if (input.dividendYears === null) {
    return { score: null, explanation: "Sem histórico de proventos registrado." };
  }
  const years = Math.min(input.dividendYears, 5);
  return {
    score: years / 5,
    explanation:
      years >= 5
        ? "Pagou proventos em todos os últimos 5 anos."
        : `Pagou proventos em ${years} dos últimos 5 anos.`,
  };
}

function evaluateLiquidity(input: ScoreInput): CriterionResult {
  if (input.liquidity === null) {
    return { score: null, explanation: "Liquidez diária não informada." };
  }
  const millions = input.liquidity / 1_000_000;
  return {
    score: scaleUp(millions, 0.2, 10),
    explanation:
      millions >= 5
        ? `Giro diário de R$ ${fmt(millions)} milhões — boa liquidez.`
        : `Giro diário de R$ ${fmt(millions)} milhões — liquidez restrita.`,
  };
}

function evaluateGovernance(input: ScoreInput): CriterionResult {
  const parts: number[] = [];
  const texts: string[] = [];

  if (input.tagAlong !== null) {
    parts.push(scaleUp(input.tagAlong, 0, 100));
    texts.push(`tag along de ${fmt(input.tagAlong, 0)}%`);
  }
  if (input.freeFloat !== null) {
    parts.push(scaleUp(input.freeFloat, 5, 25));
    texts.push(`free float de ${fmt(input.freeFloat, 0)}%`);
  }

  if (parts.length === 0) return { score: null, explanation: "Dados de governança não informados." };

  return {
    score: parts.reduce((sum, p) => sum + p, 0) / parts.length,
    explanation: `Proteção ao minoritário com ${texts.join(" e ")}.`,
  };
}

const EVALUATORS: Record<ScoreCriterionKey, (input: ScoreInput) => CriterionResult> = {
  valuation: evaluateValuation,
  dividendYield: evaluateDividendYield,
  pl: evaluatePl,
  roe: evaluateRoe,
  margins: evaluateMargins,
  debt: evaluateDebt,
  priceSafetyMargin: evaluateSafetyMargin,
  dividendHistory: evaluateDividendHistory,
  liquidity: evaluateLiquidity,
  governance: evaluateGovernance,
};

export function ratingFor(score: number | null): ScoreRating {
  if (score === null) return "NO_DATA";
  if (score >= 80) return "EXCELLENT";
  if (score >= 60) return "GOOD";
  if (score >= 40) return "FAIR";
  return "WEAK";
}

export function computeAssetScore(
  input: ScoreInput,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): AssetScore {
  const breakdown: CriterionBreakdown[] = [];
  let weightedSum = 0;
  let effectiveWeight = 0;
  let totalWeight = 0;

  for (const key of Object.keys(EVALUATORS) as ScoreCriterionKey[]) {
    const weight = Math.max(0, weights[key] ?? 0);
    const result = EVALUATORS[key](input);
    totalWeight += weight;

    if (result.score !== null && weight > 0) {
      weightedSum += result.score * weight;
      effectiveWeight += weight;
    }

    breakdown.push({
      key,
      label: CRITERION_LABELS[key],
      weight,
      score: result.score === null ? null : Math.round(result.score * 100),
      explanation: result.explanation,
    });
  }

  const score = effectiveWeight > 0 ? Math.round((weightedSum / effectiveWeight) * 100) : null;

  return {
    score,
    rating: ratingFor(score),
    breakdown,
    coverage: totalWeight > 0 ? Math.round((effectiveWeight / totalWeight) * 100) : 0,
  };
}

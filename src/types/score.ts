export type ScoreCriterionKey =
  | "valuation"
  | "dividendYield"
  | "pl"
  | "roe"
  | "margins"
  | "debt"
  | "priceSafetyMargin"
  | "dividendHistory"
  | "liquidity"
  | "governance";

export type ScoreWeights = Record<ScoreCriterionKey, number>;

export interface CriterionBreakdown {
  key: ScoreCriterionKey;
  label: string;
  /** Peso configurado pelo usuário (0–100). */
  weight: number;
  /** Nota do critério (0–100); null quando faltam dados. */
  score: number | null;
  /** Explicação do porquê da nota, ex: "ROE de 18,2% (bom retorno sobre patrimônio)". */
  explanation: string;
}

export type ScoreRating = "EXCELLENT" | "GOOD" | "FAIR" | "WEAK" | "NO_DATA";

export interface AssetScore {
  /** Nota final 0–100; null quando não há dado nenhum. */
  score: number | null;
  rating: ScoreRating;
  breakdown: CriterionBreakdown[];
  /** Soma dos pesos dos critérios que tinham dados — indica confiabilidade da nota. */
  coverage: number;
}

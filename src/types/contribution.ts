export interface StrategyConfig {
  /** Priorizar redução do desbalanceamento frente às metas. */
  rebalance: boolean;
  /** Priorizar ativos abaixo do preço justo (Graham). */
  belowFair: boolean;
  /** Priorizar ativos abaixo do preço teto (Bazin). */
  belowCeiling: boolean;
  /** Priorizar maior margem de segurança. */
  safetyMargin: boolean;
  /** Priorizar maior Dividend Yield. */
  dividendYield: boolean;
}

export interface PlanItem {
  assetId: string;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  invested: number;
  /** Nota de oportunidade 0–100 calculada sobre a carteira antes do aporte. */
  score: number;
  reasons: string[];
  /** Fração do patrimônio antes/depois do aporte. */
  weightBefore: number;
  weightAfter: number;
}

export interface ClassProjection {
  label: string;
  before: number;
  after: number;
  target: number | null;
}

export interface ContributionPlan {
  amount: number;
  spent: number;
  leftover: number;
  totalBefore: number;
  totalAfter: number;
  items: PlanItem[];
  byClassAfter: ClassProjection[];
  warnings: string[];
}

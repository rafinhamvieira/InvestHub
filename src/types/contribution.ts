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
  /** Meta individual resolvida (metas de classe/setor já repartidas). Null = sem meta. */
  targetWeight: number | null;
}

export interface ClassProjection {
  label: string;
  before: number;
  after: number;
  target: number | null;
}

/** Por que o motor não recomendou nenhuma compra. */
export type NoPurchaseReason =
  /** Nenhum ativo na carteira, watchlist ou metas. */
  | "NO_ASSETS"
  /** Nenhum ativo com cotação conhecida. */
  | "NO_PRICES"
  /** Só o rebalanceamento está ativo, mas não há metas de alocação definidas. */
  | "NO_TARGETS"
  /** O valor informado não cobre nem uma unidade do ativo mais barato. */
  | "AMOUNT_TOO_SMALL"
  /** Todos os grupos já estão na meta ou acima dela. */
  | "ALL_ABOVE_TARGET"
  /** Os critérios escolhidos dependem de indicadores que os ativos não têm. */
  | "NO_CRITERIA_DATA";

export interface ContributionPlan {
  amount: number;
  spent: number;
  leftover: number;
  totalBefore: number;
  totalAfter: number;
  items: PlanItem[];
  byClassAfter: ClassProjection[];
  warnings: string[];
  /** Preenchido apenas quando `items` está vazio, para a tela poder orientar o usuário. */
  reason: NoPurchaseReason | null;
}

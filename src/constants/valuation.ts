/** Premissas padrão dos métodos de valuation — sobrescritas por ValuationAssumption do usuário. */
export const VALUATION_DEFAULTS = {
  /** Yield mínimo de Bazin (fração). */
  bazinMinYield: 0.06,
  /** Multiplicador de Graham (P/L 15 × P/VP 1.5). */
  grahamMultiplier: 22.5,
  /** DCF: crescimento fase explícita (fração). */
  dcfGrowthRate: 0.05,
  /** DCF: taxa de desconto (fração). */
  dcfDiscountRate: 0.12,
  /** DCF: crescimento na perpetuidade (fração). */
  dcfPerpetuityGrowthRate: 0.03,
  /** DCF: anos da fase explícita. */
  dcfProjectionYears: 10,
  /** Margem de segurança desejada para veredito "Comprar" (fração). */
  desiredSafetyMargin: 0.2,
} as const;

export interface DashboardSummary {
  /** Valor de mercado atual da carteira. */
  totalValue: number;
  /** Custo total das posições abertas (base de custo). */
  totalInvested: number;
  /** totalValue - totalInvested. Positivo = lucro, negativo = prejuízo. */
  profit: number;
  /** Fração: profit / totalInvested. */
  profitPercent: number;
  /** Proventos já recebidos (data ex no passado, posição na data ex). */
  dividendsAccumulated: number;
  /** Proventos declarados com pagamento futuro. */
  dividendsUpcoming: number;
  /** Dividend Yield da carteira: proventos dos últimos 12 meses / valor atual. Fração. */
  portfolioYield12m: number;
}

export interface EvolutionPoint {
  /** Rótulo do mês, ex: "jan/25". */
  month: string;
  invested: number;
  value: number;
}

export interface MonthlyDividendPoint {
  month: string;
  total: number;
}

export interface AllocationSlice {
  label: string;
  value: number;
  /** Fração do total. */
  percent: number;
}

export interface DashboardData {
  hasData: boolean;
  summary: DashboardSummary;
  evolution: EvolutionPoint[];
  dividendsByMonth: MonthlyDividendPoint[];
  bySector: AllocationSlice[];
  byType: AllocationSlice[];
}

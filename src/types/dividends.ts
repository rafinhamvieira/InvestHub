/** Provento declarado de um ativo, já com o cadastro do ativo junto. */
export interface DividendEvent {
  id: string;
  assetId: string;
  ticker: string;
  name: string;
  /** DIVIDENDO, JRS CAP PROPRIO, RENDIMENTO... como veio da fonte. */
  type: string;
  valuePerShare: number;
  /** Data-com: quem tinha o ativo neste dia recebe. */
  exDate: string;
  paymentDate: string | null;
  declaredAt: string | null;
}

/** Provento cruzado com a custódia do usuário na data-com. */
export interface DividendRow extends DividendEvent {
  /** Quantidade em custódia na data-com (estimada pela posição atual, se ainda não passou). */
  quantity: number;
  total: number;
  /** Data usada para posicionar o provento no tempo: pagamento quando existe, senão data-com. */
  effectiveDate: string;
  /** True quando a quantidade é estimativa (data-com no futuro). */
  estimated: boolean;
}

export interface PeriodTotals {
  /** Últimos 12 meses. */
  last12m: number;
  /** Últimos 24 meses. */
  last24m: number;
  /** Últimos 60 meses. */
  last60m: number;
  /** Tudo que já foi recebido. */
  allTime: number;
}

export interface DividendMonthPoint {
  /** "01/2026" */
  label: string;
  total: number;
}

export interface DividendYearPoint {
  year: number;
  total: number;
}

export interface DividendAssetSummary {
  assetId: string;
  ticker: string;
  name: string;
  total: number;
  /** Quantos proventos entraram no período. */
  events: number;
  /** Último provento recebido no período. */
  lastPayment: string | null;
  /** Total recebido / custo da posição atual (yield on cost). Null sem posição. */
  yieldOnCost: number | null;
}

export interface DividendOverview {
  totals: PeriodTotals;
  /** Média mensal dos últimos 12 meses. */
  monthlyAverage12m: number;
  /** DY sobre o custo da carteira nos últimos 12 meses. */
  yieldOnCost12m: number | null;
  /** Proventos já recebidos, do mais recente para o mais antigo. */
  received: DividendRow[];
  /** Anunciados que ainda serão pagos. */
  upcoming: DividendRow[];
  byMonth: DividendMonthPoint[];
  byYear: DividendYearPoint[];
  byAsset: DividendAssetSummary[];
  /** Data da última sincronização de proventos, se conhecida. */
  lastSyncAt: string | null;
}

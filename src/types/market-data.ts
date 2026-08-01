/** Contratos do provedor de dados de mercado — implementações são intercambiáveis. */

export interface MarketQuote {
  ticker: string;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
  /** Data de referência da cotação. */
  date: Date;
  name: string | null;
  sector: string | null;
  /** Indicadores que o provedor conseguir entregar (null = indisponível no plano). */
  pl: number | null;
  /** DY anual em percentual (8.5 = 8.5%). */
  dividendYieldPercent: number | null;
  marketCap: number | null;
}

export interface MarketOhlcBar {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface MarketDividend {
  type: string;
  valuePerShare: number;
  /** Data-com: último dia em que quem tinha o ativo garantiu o provento. */
  exDate: Date;
  paymentDate: Date | null;
  /** Data de aprovação/anúncio, quando a fonte informa. */
  declaredAt?: Date | null;
}

/** Item do catálogo completo do mercado, obtido em uma única requisição. */
export interface MarketListItem {
  ticker: string;
  name: string;
  price: number;
  /** Variação do dia em percentual. */
  changePercent: number | null;
  volume: number | null;
  marketCap: number | null;
  /** Já traduzido para português. */
  sector: string | null;
  subsector: string | null;
  /** Classificação do provedor: ação, fundo imobiliário ou BDR. */
  assetType: "STOCK" | "FII" | "BDR";
}

/**
 * Indicadores fundamentalistas de um ativo, já normalizados.
 * Percentuais vêm em pontos percentuais (12.5 = 12,5%).
 */
export interface AssetFundamentals {
  ticker: string;
  /** Data-base do balanço/apuração usada pelo provedor. */
  referenceDate: Date;
  price: number | null;
  pl: number | null;
  pvp: number | null;
  dividendYield: number | null;
  roe: number | null;
  roic: number | null;
  netMargin: number | null;
  ebitdaMargin: number | null;
  evEbit: number | null;
  evEbitda: number | null;
  netDebt: number | null;
  netDebtEbitda: number | null;
  equity: number | null;
  marketCap: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  // Específicos de FII
  vacancy: number | null;
  numberOfProperties: number | null;
  numberOfShareholders: number | null;
  managerName: string | null;
  /** Segmento do FII (Logística, Papel, Shopping...). */
  segment: string | null;
}

/**
 * Fonte de indicadores fundamentalistas, separada da fonte de cotações.
 *
 * São contratos distintos porque as duas coisas têm cadência e custo diferentes:
 * preço muda o dia inteiro e sai barato em lote; fundamento muda a cada trimestre e
 * costuma ser cobrado por ativo. Isso permite combinar provedores — hoje, preços do
 * brapi e fundamentos do Bolsai.
 */
export interface FundamentalsProvider {
  readonly name: string;
  /** Retorna null quando o provedor não cobre o ativo. */
  getFundamentals(ticker: string, isFii: boolean): Promise<AssetFundamentals | null>;
}

export interface MarketDataProvider {
  readonly name: string;

  /**
   * Catálogo completo do mercado em uma requisição só.
   *
   * É a forma mais econômica de manter preço e cadastro atualizados: o dado é global
   * (não pertence a um usuário), então uma chamada serve toda a base. Requisições por
   * ticker ficam reservadas ao que só existe nelas (P/L, LPA, histórico).
   */
  listAll(): Promise<MarketListItem[]>;
  /** Cotações + indicadores + dividendos em lote. Tickers com falha ficam fora do resultado. */
  getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>>;
  /** Série OHLC diária. range: "1mo" | "3mo" | "1y" | "5y" | "max". */
  getHistory(ticker: string, range: string): Promise<MarketOhlcBar[]>;
  /** Proventos declarados. */
  getDividends(ticker: string): Promise<MarketDividend[]>;
}

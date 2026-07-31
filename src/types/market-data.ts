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
  exDate: Date;
  paymentDate: Date | null;
}

export interface MarketDataProvider {
  readonly name: string;
  /** Cotações + indicadores + dividendos em lote. Tickers com falha ficam fora do resultado. */
  getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>>;
  /** Série OHLC diária. range: "1mo" | "3mo" | "1y" | "5y" | "max". */
  getHistory(ticker: string, range: string): Promise<MarketOhlcBar[]>;
  /** Proventos declarados. */
  getDividends(ticker: string): Promise<MarketDividend[]>;
}

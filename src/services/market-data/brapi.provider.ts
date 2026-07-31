import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type {
  MarketDataProvider,
  MarketQuote,
  MarketOhlcBar,
  MarketDividend,
} from "@/types/market-data";

const QUOTE_CACHE_TTL = 15 * 60; // 15 min
const HISTORY_CACHE_TTL = 60 * 60; // 1h
const BATCH_SIZE = 10;
const REQUEST_DELAY_MS = 350;
const REQUEST_TIMEOUT_MS = 15_000;

interface BrapiHistoricalPrice {
  date: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface BrapiCashDividend {
  label?: string;
  rate?: number;
  paymentDate?: string;
  lastDatePrior?: string;
}

interface BrapiQuoteResult {
  symbol: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketVolume?: number;
  regularMarketTime?: string;
  priceEarnings?: number | null;
  marketCap?: number | null;
  historicalDataPrice?: BrapiHistoricalPrice[];
  dividendsData?: { cashDividends?: BrapiCashDividend[] };
  summaryProfile?: { sector?: string };
}

interface BrapiResponse {
  results?: BrapiQuoteResult[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Provedor brapi.dev (https://brapi.dev) — plano gratuito com token.
 * Campos não disponíveis no plano ficam null; o restante do sistema tolera ausência.
 */
export class BrapiProvider implements MarketDataProvider {
  readonly name = "brapi";

  private baseUrl = process.env.MARKET_DATA_BASE_URL || "https://brapi.dev/api";
  private token = process.env.MARKET_DATA_API_KEY || "";

  private async request(path: string, params: Record<string, string>): Promise<BrapiResponse | null> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (this.token) url.searchParams.set("token", this.token);

    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        logger.warn("brapi respondeu com erro", { path, status: response.status });
        return null;
      }
      return (await response.json()) as BrapiResponse;
    } catch (error) {
      logger.warn("Falha na chamada à brapi", { path, error: (error as Error).message });
      return null;
    }
  }

  private mapQuote(result: BrapiQuoteResult): MarketQuote | null {
    const price = num(result.regularMarketPrice);
    if (price === null || price <= 0) return null;

    // DY real: soma dos proventos (rate) dos últimos 12 meses / preço.
    let dividendYieldPercent: number | null = null;
    const cash = result.dividendsData?.cashDividends ?? [];
    if (cash.length > 0) {
      const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const last12m = cash
        .filter((d) => d.lastDatePrior && new Date(d.lastDatePrior).getTime() >= cutoff)
        .reduce((sum, d) => sum + (num(d.rate) ?? 0), 0);
      if (last12m > 0) dividendYieldPercent = (last12m / price) * 100;
    }

    return {
      ticker: result.symbol.toUpperCase(),
      price,
      open: num(result.regularMarketOpen),
      high: num(result.regularMarketDayHigh),
      low: num(result.regularMarketDayLow),
      previousClose: num(result.regularMarketPreviousClose),
      volume: num(result.regularMarketVolume),
      date: result.regularMarketTime ? new Date(result.regularMarketTime) : new Date(),
      name: result.longName ?? result.shortName ?? null,
      sector: result.summaryProfile?.sector ?? null,
      pl: num(result.priceEarnings),
      dividendYieldPercent,
      marketCap: num(result.marketCap),
    };
  }

  async getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
    const quotes = new Map<string, MarketQuote>();
    const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const batch = unique.slice(i, i + BATCH_SIZE);
      const cacheKey = `brapi:quotes:${batch.join(",")}`;

      const results = await cached<BrapiQuoteResult[]>(cacheKey, QUOTE_CACHE_TTL, async () => {
        const data = await this.request(`/quote/${batch.join(",")}`, { dividends: "true" });
        return data?.results ?? [];
      });

      for (const result of results) {
        const quote = this.mapQuote(result);
        if (quote) quotes.set(quote.ticker, quote);
      }

      if (i + BATCH_SIZE < unique.length) await sleep(REQUEST_DELAY_MS);
    }

    return quotes;
  }

  async getHistory(ticker: string, range: string): Promise<MarketOhlcBar[]> {
    const cacheKey = `brapi:history:${ticker}:${range}`;

    const bars = await cached<Array<Omit<MarketOhlcBar, "date"> & { date: string }>>(
      cacheKey,
      HISTORY_CACHE_TTL,
      async () => {
        const data = await this.request(`/quote/${ticker}`, { range, interval: "1d" });
        const history = data?.results?.[0]?.historicalDataPrice ?? [];
        return history
          .filter((bar) => num(bar.close) !== null)
          .map((bar) => ({
            date: new Date(bar.date * 1000).toISOString(),
            open: num(bar.open),
            high: num(bar.high),
            low: num(bar.low),
            close: num(bar.close)!,
            volume: num(bar.volume),
          }));
      },
    );

    return bars.map((bar) => ({ ...bar, date: new Date(bar.date) }));
  }

  async getDividends(ticker: string): Promise<MarketDividend[]> {
    const data = await this.request(`/quote/${ticker}`, { dividends: "true" });
    const cash = data?.results?.[0]?.dividendsData?.cashDividends ?? [];

    return cash
      .filter((d) => num(d.rate) !== null && d.lastDatePrior)
      .map((d) => ({
        type: d.label ?? "Provento",
        valuePerShare: num(d.rate)!,
        exDate: new Date(d.lastDatePrior!),
        paymentDate: d.paymentDate ? new Date(d.paymentDate) : null,
      }));
  }
}

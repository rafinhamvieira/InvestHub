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
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Quantos tickers cabem em uma requisição.
 *
 * O plano gratuito da brapi aceita apenas 1 — pedir mais devolve HTTP 400 com
 * "QUOTES_PER_REQUEST_EXCEEDED". Planos pagos aceitam mais; ajuste por MARKET_DATA_BATCH_SIZE.
 */
const BATCH_SIZE = Math.max(1, Number(process.env.MARKET_DATA_BATCH_SIZE ?? 1));

/** Pausa entre requisições, para não estourar o limite por minuto do provedor. */
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.MARKET_DATA_DELAY_MS ?? 400));

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
  /** Em erros de negócio a brapi responde com este corpo (às vezes com HTTP 400). */
  error?: boolean;
  message?: string;
  code?: string;
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

  /**
   * Recursos que dependem do plano contratado. Começamos otimistas e desligamos o que
   * o provedor recusar — assim o mesmo código atende plano gratuito e pago, sem que uma
   * funcionalidade indisponível derrube a coleta de preço, que é o essencial.
   */
  private dividendsEnabled = process.env.MARKET_DATA_DIVIDENDS !== "false";
  private profileEnabled = true;

  private async request(
    path: string,
    params: Record<string, string>,
  ): Promise<{ data: BrapiResponse | null; code?: string }> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (this.token) url.searchParams.set("token", this.token);

    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });

      const data = (await response.json().catch(() => null)) as BrapiResponse | null;

      // A brapi sinaliza erro de negócio no corpo, às vezes com HTTP 200. Registramos a
      // mensagem para o problema ser acionável ("plano permite no máximo 1 ativo",
      // "módulo indisponível no seu plano", "token inválido").
      if (!response.ok || data?.error) {
        logger.warn("brapi respondeu com erro", {
          path,
          status: response.status,
          code: data?.code,
          message: data?.message,
        });
        return { data: null, code: data?.code };
      }

      return { data };
    } catch (error) {
      logger.warn("Falha na chamada à brapi", { path, error: (error as Error).message });
      return { data: null };
    }
  }

  /**
   * Busca um ticker e guarda o resultado bruto em cache.
   *
   * Cotação, indicadores, setor e proventos vêm todos nesta única chamada — e tanto
   * getQuotes quanto getDividends leem daqui, para não gastar duas requisições da cota
   * do provedor com o mesmo ativo.
   */
  private async fetchTicker(ticker: string): Promise<BrapiQuoteResult | null> {
    return cached<BrapiQuoteResult | null>(
      `brapi:ticker:${ticker}`,
      QUOTE_CACHE_TTL,
      async () => {
        // Tenta com os extras; se o plano recusar algum, desliga e refaz sem ele.
        // Uma tentativa frustrada não pode custar a cotação do ativo.
        for (let attempt = 0; attempt < 3; attempt++) {
          const params: Record<string, string> = {};
          if (this.dividendsEnabled) params.dividends = "true";
          if (this.profileEnabled) params.modules = "summaryProfile";

          const { data, code } = await this.request(`/quote/${ticker}`, params);
          if (data) return data.results?.[0] ?? null;

          if (code === "FEATURE_NOT_AVAILABLE" && this.dividendsEnabled) {
            this.dividendsEnabled = false;
            logger.warn(
              "Plano do provedor sem acesso a dividendos — seguindo apenas com cotação, fundamentos e setor.",
            );
            continue;
          }
          if (code === "MODULES_NOT_AVAILABLE" && this.profileEnabled) {
            this.profileEnabled = false;
            logger.warn("Plano do provedor sem acesso ao setor do ativo.");
            continue;
          }
          return null;
        }
        return null;
      },
      // Falhas não entram no cache: senão o erro persistiria pelo TTL inteiro e as
      // sincronizações seguintes nem tentariam a rede.
      { cacheIf: (result) => result !== null },
    );
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

      const results = await Promise.all(batch.map((ticker) => this.fetchTicker(ticker)));
      for (const result of results) {
        if (!result) continue;
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
        const { data } = await this.request(`/quote/${ticker}`, { range, interval: "1d" });
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
      // Mesma razão do cache de cotação: uma falha não pode ficar guardada por 1 hora.
      { cacheIf: (bars) => bars.length > 0 },
    );

    return bars.map((bar) => ({ ...bar, date: new Date(bar.date) }));
  }

  async getDividends(ticker: string): Promise<MarketDividend[]> {
    // Lê do mesmo cache preenchido por getQuotes — sem gastar outra requisição.
    const result = await this.fetchTicker(ticker.toUpperCase());
    const cash = result?.dividendsData?.cashDividends ?? [];

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

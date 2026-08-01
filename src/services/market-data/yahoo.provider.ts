/**
 * Histórico de proventos pelo endpoint público de gráficos do Yahoo Finance.
 *
 * Uma requisição por ticker devolve todos os proventos já pagos — o que a B3 não entrega
 * sem paginar empresa por empresa. Em compensação não traz o que ainda vai ser pago nem a
 * data de pagamento; esse lado fica com o `b3.provider.ts`.
 *
 * O Yahoo informa a **data-ex**; o resto do sistema trabalha com **data-com** (o dia
 * anterior, último em que a posição garante o provento). A conversão acontece aqui, para
 * que a origem do dado não vaze para o restante do código.
 */

import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { previousBusinessDay } from "@/utils/date";
import type { MarketDividend } from "@/types/market-data";

const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
/** Histórico antigo não muda; só o fim da série. */
const CACHE_TTL = 12 * 60 * 60; // 12h
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_YEARS = 6;

interface YahooDividendEvent {
  /** Epoch em segundos da data-ex. */
  date?: number;
  amount?: number;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{ events?: { dividends?: Record<string, YahooDividendEvent> } }> | null;
    error?: { description?: string } | null;
  };
}

/**
 * Converte os eventos do Yahoo em proventos com data-com.
 *
 * O tipo (dividendo, JCP, rendimento) não vem na resposta — fica genérico e é
 * sobrescrito quando a B3 tiver o mesmo evento com o rótulo certo.
 */
export function mapYahooDividends(
  events: Record<string, YahooDividendEvent> | undefined,
): MarketDividend[] {
  if (!events) return [];

  return Object.values(events)
    .filter((event) => typeof event.date === "number" && typeof event.amount === "number")
    .filter((event) => event.amount! > 0)
    .map((event) => ({
      type: "Provento",
      valuePerShare: event.amount!,
      exDate: previousBusinessDay(new Date(event.date! * 1000)),
      paymentDate: null,
      declaredAt: null,
    }))
    .sort((a, b) => a.exDate.getTime() - b.exDate.getTime());
}

export class YahooProvider {
  readonly name = "Yahoo Finance";

  /** Ticker da B3 no Yahoo leva o sufixo do país. */
  private symbol(ticker: string): string {
    return `${ticker.toUpperCase()}.SA`;
  }

  async getDividendHistory(ticker: string, years = DEFAULT_YEARS): Promise<MarketDividend[]> {
    const symbol = this.symbol(ticker);
    const period1 = Math.floor(Date.now() / 1000) - years * 365 * 24 * 60 * 60;
    const period2 = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

    const events = await cached<Record<string, YahooDividendEvent>>(
      `yahoo:dividends:${symbol}:${years}`,
      CACHE_TTL,
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const url = `${BASE_URL}/${symbol}?period1=${period1}&period2=${period2}&interval=1d&events=div`;
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
            },
          });

          if (!response.ok) {
            logger.warn("Yahoo respondeu com erro", { symbol, status: response.status });
            return {};
          }

          const data = (await response.json()) as YahooChartResponse;
          return data.chart?.result?.[0]?.events?.dividends ?? {};
        } catch (error) {
          logger.warn("Falha ao consultar o Yahoo", { symbol, error: (error as Error).message });
          return {};
        } finally {
          clearTimeout(timeout);
        }
      },
      { cacheIf: (result) => Object.keys(result).length > 0 },
    );

    return mapYahooDividends(events);
  }
}

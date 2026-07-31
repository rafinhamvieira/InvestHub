import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type { AssetFundamentals, FundamentalsProvider } from "@/types/market-data";

/** Fundamento muda a cada trimestre — cache longo economiza a cota diária. */
const CACHE_TTL = 12 * 60 * 60; // 12h
const REQUEST_TIMEOUT_MS = 20_000;

interface BolsaiStockFundamentals {
  ticker: string;
  reference_date?: string;
  close_price?: number | null;
  market_cap?: number | null;
  pl?: number | null;
  pvp?: number | null;
  dividend_yield?: number | null;
  ev_ebitda?: number | null;
  ev_ebit?: number | null;
  roe?: number | null;
  roic?: number | null;
  net_margin?: number | null;
  ebitda_margin?: number | null;
  net_debt?: number | null;
  net_debt_ebitda?: number | null;
  equity?: number | null;
  cagr_revenue_5y?: number | null;
  cagr_earnings_5y?: number | null;
}

interface BolsaiFii {
  ticker: string;
  reference_date?: string;
  close_price?: number | null;
  pvp?: number | null;
  dividend_yield_ttm?: number | null;
  net_asset_value?: number | null;
  total_shareholders?: number | null;
  segment?: string | null;
  administrator?: string | null;
  property_count?: number | null;
  vacancy_pct?: number | null;
}

interface BolsaiError {
  error?: string;
  detail?: string;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Provedor Bolsai (https://usebolsai.com) — dados oriundos de B3, CVM e BCB.
 *
 * O plano gratuito cobre 200 requisições/dia e libera os indicadores de ações
 * (/fundamentals) e o cadastro completo de FIIs (/fiis), incluindo dividend yield,
 * vacância e segmento. Histórico de dividendos de ações e séries históricas exigem
 * o plano Pro; os campos correspondentes ficam null e o sistema tolera a ausência.
 */
export class BolsaiProvider implements FundamentalsProvider {
  readonly name = "bolsai";

  private baseUrl = process.env.BOLSAI_BASE_URL || "https://api.usebolsai.com/api/v1";
  private apiKey = process.env.BOLSAI_API_KEY || "";

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private async request<T>(path: string): Promise<T | null> {
    if (!this.isConfigured) return null;

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "X-API-Key": this.apiKey, Accept: "application/json" },
      });

      const data = (await response.json().catch(() => null)) as (T & BolsaiError) | null;

      if (!response.ok || data?.error) {
        // "not_found" é rotina (ETFs e BDRs não são cobertos): registramos em nível
        // baixo para não poluir o log com algo que não é falha de operação.
        const notFound = response.status === 404 || data?.error === "not_found";
        const log = notFound ? logger.debug : logger.warn;
        log("Bolsai respondeu com erro", {
          path,
          status: response.status,
          error: data?.error,
          detail: data?.detail,
        });
        return null;
      }

      return data as T;
    } catch (error) {
      logger.warn("Falha na chamada ao Bolsai", { path, error: (error as Error).message });
      return null;
    }
  }

  async getFundamentals(ticker: string, isFii: boolean): Promise<AssetFundamentals | null> {
    const upper = ticker.toUpperCase();

    return cached<AssetFundamentals | null>(
      `bolsai:fundamentals:${upper}`,
      CACHE_TTL,
      async () => {
        // FIIs e ações têm endpoints e campos distintos. Quando a classificação local
        // estiver errada, tentamos o outro caminho antes de desistir do ativo.
        const primary = isFii ? this.fetchFii(upper) : this.fetchStock(upper);
        const result = await primary;
        if (result) return result;

        return isFii ? this.fetchStock(upper) : this.fetchFii(upper);
      },
      { cacheIf: (value) => value !== null },
    );
  }

  private async fetchStock(ticker: string): Promise<AssetFundamentals | null> {
    const data = await this.request<BolsaiStockFundamentals>(`/fundamentals/${ticker}`);
    if (!data?.ticker) return null;

    return {
      ticker: data.ticker.toUpperCase(),
      referenceDate: parseDate(data.reference_date),
      price: num(data.close_price),
      pl: num(data.pl),
      pvp: num(data.pvp),
      dividendYield: num(data.dividend_yield),
      roe: num(data.roe),
      roic: num(data.roic),
      netMargin: num(data.net_margin),
      ebitdaMargin: num(data.ebitda_margin),
      evEbit: num(data.ev_ebit),
      evEbitda: num(data.ev_ebitda),
      netDebt: num(data.net_debt),
      netDebtEbitda: num(data.net_debt_ebitda),
      equity: num(data.equity),
      marketCap: num(data.market_cap),
      revenueGrowth: num(data.cagr_revenue_5y),
      earningsGrowth: num(data.cagr_earnings_5y),
      vacancy: null,
      numberOfProperties: null,
      numberOfShareholders: null,
      managerName: null,
      segment: null,
    };
  }

  private async fetchFii(ticker: string): Promise<AssetFundamentals | null> {
    const data = await this.request<BolsaiFii>(`/fiis/${ticker}`);
    if (!data?.ticker) return null;

    return {
      ticker: data.ticker.toUpperCase(),
      referenceDate: parseDate(data.reference_date),
      price: num(data.close_price),
      pl: null,
      pvp: num(data.pvp),
      dividendYield: num(data.dividend_yield_ttm),
      roe: null,
      roic: null,
      netMargin: null,
      ebitdaMargin: null,
      evEbit: null,
      evEbitda: null,
      netDebt: null,
      netDebtEbitda: null,
      // Para FIIs, o patrimônio é o valor patrimonial líquido do fundo.
      equity: num(data.net_asset_value),
      marketCap: null,
      revenueGrowth: null,
      earningsGrowth: null,
      vacancy: num(data.vacancy_pct),
      numberOfProperties: num(data.property_count),
      numberOfShareholders: num(data.total_shareholders),
      managerName: data.administrator ?? null,
      segment: data.segment ?? null,
    };
  }
}

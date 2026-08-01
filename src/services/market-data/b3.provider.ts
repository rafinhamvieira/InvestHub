/**
 * Proventos anunciados pela B3 — mesma API pública que alimenta o site de listadas.
 *
 * É a única fonte gratuita que traz o provento **antes** do pagamento: data-com, data de
 * pagamento, data de aprovação e tipo (DIVIDENDO / JRS CAP PROPRIO / RENDIMENTO). Cobre
 * apenas os últimos meses — o histórico longo vem do Yahoo, em `yahoo.provider.ts`.
 *
 * Ações e fundos vivem em endpoints diferentes, ambos com o parâmetro em JSON+base64 na
 * própria URL. O retorno de uma empresa mistura todas as classes de ação (ON, PN, UNT),
 * distinguidas só pelo ISIN — daí o filtro por sufixo do ticker.
 */

import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type { MarketDividend } from "@/types/market-data";

const BASE_URL = "https://sistemaswebb3-listados.b3.com.br";
/** Proventos novos aparecem em lote, não a cada minuto. */
const CACHE_TTL = 6 * 60 * 60; // 6h
const REQUEST_TIMEOUT_MS = 20_000;
/** typeFund=7 é o código de FII na B3; FIAGRO e afins respondem em 34. */
const FUND_TYPES = [7, 34];

interface B3CashDividend {
  assetIssued?: string | null;
  paymentDate?: string | null;
  rate?: string | null;
  relatedTo?: string | null;
  approvedOn?: string | null;
  isinCode?: string | null;
  label?: string | null;
  lastDatePrior?: string | null;
}

interface B3SupplementResponse {
  cashDividends?: B3CashDividend[] | null;
}

/**
 * Sufixo do ticker que corresponde ao código de espécie do ISIN brasileiro.
 * Ex.: BRPETRACNPR6 → "ACNPR" (preferencial nominativa) → PETR**4**.
 */
const ISIN_SPECIES_SUFFIX: Record<string, string[]> = {
  ACNOR: ["3"],
  ACNPR: ["4"],
  ACNPA: ["5"],
  ACNPB: ["6"],
  ACNPC: ["7"],
  ACNPD: ["8"],
  CTF: ["11"],
  UNT: ["11"],
};

/** "0,35048636000" → 0.35048636 */
export function parseB3Rate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** "01/06/2026" → meia-noite UTC do dia. */
export function parseB3Date(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

/**
 * O registro pertence a este ticker?
 *
 * O ISIN carrega a espécie (ON/PN/UNT/cota), que é o que separa PETR3 de PETR4 no mesmo
 * retorno. Sem ISIN legível, aceitamos o registro: perder um provento real é pior do que
 * atribuir um provento a mais numa empresa de classe única.
 */
export function isinMatchesTicker(isin: string | null | undefined, ticker: string): boolean {
  const suffix = ticker.toUpperCase().replace(/^[A-Z]{4}/, "");
  if (!isin) return true;

  const species = Object.keys(ISIN_SPECIES_SUFFIX).find((code) =>
    isin.toUpperCase().includes(code),
  );
  if (!species) return true;

  return ISIN_SPECIES_SUFFIX[species]!.includes(suffix);
}

/** Converte o retorno cru da B3 em proventos do ticker pedido. */
export function mapB3CashDividends(
  ticker: string,
  records: B3CashDividend[],
): MarketDividend[] {
  const mapped: MarketDividend[] = [];

  for (const record of records) {
    const valuePerShare = parseB3Rate(record.rate);
    const exDate = parseB3Date(record.lastDatePrior);
    if (valuePerShare === null || !exDate) continue;
    if (!isinMatchesTicker(record.isinCode ?? record.assetIssued, ticker)) continue;

    mapped.push({
      type: record.label?.trim() || "Provento",
      valuePerShare,
      exDate,
      paymentDate: parseB3Date(record.paymentDate),
      declaredAt: parseB3Date(record.approvedOn),
    });
  }

  return mapped;
}

export class B3Provider {
  readonly name = "B3";

  private async request<T>(path: string): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          // Sem User-Agent de navegador o proxy da B3 devolve 403.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        logger.warn("B3 respondeu com erro", { path, status: response.status });
        return null;
      }
      return (await response.json()) as T;
    } catch (error) {
      logger.warn("Falha ao consultar a B3", { path, error: (error as Error).message });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Parâmetro da B3: JSON em base64 dentro da própria URL. */
  private encode(params: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(params)).toString("base64");
  }

  private async fetchCompany(code: string): Promise<B3CashDividend[]> {
    const payload = this.encode({ issuingCompany: code, language: "pt-br" });
    const data = await this.request<B3SupplementResponse[]>(
      `/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/${payload}`,
    );
    return data?.[0]?.cashDividends ?? [];
  }

  private async fetchFund(code: string): Promise<B3CashDividend[]> {
    for (const typeFund of FUND_TYPES) {
      const payload = this.encode({ typeFund, identifierFund: code, language: "pt-br" });
      const data = await this.request<B3SupplementResponse>(
        `/fundsProxy/fundsCall/GetListedSupplementFunds/${payload}`,
      );
      const records = data?.cashDividends ?? [];
      if (records.length > 0) return records;
    }
    return [];
  }

  /**
   * Proventos anunciados do ativo, incluindo os que ainda serão pagos.
   * O código na B3 são as 4 primeiras letras do ticker (PETR4 → PETR).
   */
  async getAnnouncedDividends(ticker: string, isFii: boolean): Promise<MarketDividend[]> {
    const normalized = ticker.toUpperCase();
    const code = normalized.slice(0, 4);

    const records = await cached<B3CashDividend[]>(
      `b3:dividends:${isFii ? "fund" : "company"}:${code}`,
      CACHE_TTL,
      () => (isFii ? this.fetchFund(code) : this.fetchCompany(code)),
      { cacheIf: (result) => result.length > 0 },
    );

    return mapB3CashDividends(normalized, records);
  }
}

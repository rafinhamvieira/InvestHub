/**
 * Séries de indexadores do Banco Central (API SGS) — pública, sem chave.
 *
 * É a fonte oficial do que corrige renda fixa no Brasil: CDI e Selic diários (usados por
 * CDB, LCI/LCA e Tesouro Selic) e IPCA mensal (Tesouro IPCA+, CDB atrelado à inflação).
 *
 *   https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=..&dataFinal=..
 *
 * A série inteira é baixada de uma vez e guardada em cache: são poucos KB e serve todos os
 * títulos da base, em vez de uma requisição por papel.
 */

import { cached } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type { DailyRate, MonthlyRate } from "@/utils/fixed-income-math";

const BASE_URL = "https://api.bcb.gov.br/dados/serie";
const REQUEST_TIMEOUT_MS = 20_000;
/** A taxa do dia sai uma vez por dia; meio dia de cache não atrasa nada. */
const CACHE_TTL = 12 * 60 * 60;

/** Códigos SGS. */
const SERIES = {
  SELIC: 11,
  CDI: 12,
  IPCA: 433,
} as const;

interface SgsPoint {
  data: string;
  valor: string;
}

/** "01/07/2026" → meia-noite UTC. */
function parseSgsDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

function formatSgsDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

export function mapSgsSeries(points: SgsPoint[]): DailyRate[] {
  return points.flatMap((point) => {
    const date = parseSgsDate(point.data);
    const rate = Number(point.valor);
    return date && Number.isFinite(rate) ? [{ date, rate }] : [];
  });
}

export class BcbProvider {
  readonly name = "Banco Central (SGS)";

  private async fetchSeries(code: number, since: Date): Promise<SgsPoint[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const url =
        `${BASE_URL}/bcdata.sgs.${code}/dados?formato=json` +
        `&dataInicial=${formatSgsDate(since)}&dataFinal=${formatSgsDate(until)}`;

      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) {
        logger.warn("BCB respondeu com erro", { code, status: response.status });
        return [];
      }
      return (await response.json()) as SgsPoint[];
    } catch (error) {
      logger.warn("Falha ao consultar o BCB", { code, error: (error as Error).message });
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private async series(code: number, since: Date): Promise<SgsPoint[]> {
    // Cache por mês de início: títulos comprados no mesmo mês compartilham a série.
    const anchor = `${since.getUTCFullYear()}-${String(since.getUTCMonth() + 1).padStart(2, "0")}`;
    return cached<SgsPoint[]>(
      `bcb:sgs:${code}:${anchor}`,
      CACHE_TTL,
      () => this.fetchSeries(code, since),
      { cacheIf: (points) => points.length > 0 },
    );
  }

  /** Série diária do pós-fixado, em percentual ao dia. */
  async getDailyRates(indexer: "CDI" | "SELIC", since: Date): Promise<DailyRate[]> {
    return mapSgsSeries(await this.series(SERIES[indexer], since));
  }

  /** Série mensal do IPCA, em percentual ao mês. */
  async getIpcaRates(since: Date): Promise<MonthlyRate[]> {
    return mapSgsSeries(await this.series(SERIES.IPCA, since));
  }
}

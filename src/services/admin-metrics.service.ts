/**
 * Números de negócio do painel administrativo.
 *
 * São seis agregações independentes sobre tabelas grandes. Rodam em paralelo e passam por um
 * cache curto: o painel é aberto e recarregado com frequência, e o valor de "quantas contas
 * existem" não muda em um minuto — já o custo de varrer posições e transações a cada F5 muda.
 *
 * O cache falha aberto (é o `cached` do projeto): Redis fora do ar deixa a tela mais lenta,
 * nunca em branco.
 */

import { cached } from "@/lib/cache";
import { adminMetricsRepository } from "@/repositories/admin-metrics.repository";
import type { BusinessMetrics } from "@/types/admin";

const CACHE_KEY = "admin:metrics";
const CACHE_TTL_SECONDS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export const adminMetricsService = {
  async summary(): Promise<BusinessMetrics> {
    return cached(CACHE_KEY, CACHE_TTL_SECONDS, () => collect());
  },
};

async function collect(): Promise<BusinessMetrics> {
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const since30d = new Date(now.getTime() - 30 * DAY_MS);
  const since12m = new Date(now.getTime() - 365 * DAY_MS);
  const until30d = new Date(now.getTime() + 30 * DAY_MS);

  const [users, portfolio, dividends, fixedIncome, coverage] = await Promise.all([
    adminMetricsRepository.users(since7d, since30d),
    adminMetricsRepository.portfolio(since30d),
    adminMetricsRepository.dividends(since12m, now, until30d),
    adminMetricsRepository.fixedIncome(),
    adminMetricsRepository.coverage(),
  ]);

  return {
    users,
    portfolio,
    dividends,
    fixedIncome,
    coverage: {
      ...coverage,
      fundamentalsRatio:
        coverage.activeAssets === 0 ? 0 : coverage.withFundamentals / coverage.activeAssets,
    },
    generatedAt: now.toISOString(),
  };
}

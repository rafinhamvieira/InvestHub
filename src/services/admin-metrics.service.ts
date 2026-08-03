/**
 * Números do painel administrativo: tamanho do cadastro e cobertura do catálogo.
 *
 * Nada de carteira — nem agregado. Ver o cabeçalho de `admin-metrics.repository`.
 *
 * Cache curto porque o painel é aberto e recarregado com frequência, e "quantas contas
 * existem" não muda em um minuto. O cache falha aberto (é o `cached` do projeto): Redis fora
 * do ar deixa a tela mais lenta, nunca em branco.
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

  const [users, coverage] = await Promise.all([
    adminMetricsRepository.users(since7d, since30d),
    adminMetricsRepository.coverage(),
  ]);

  return {
    users,
    coverage: {
      ...coverage,
      fundamentalsRatio:
        coverage.activeAssets === 0 ? 0 : coverage.withFundamentals / coverage.activeAssets,
    },
    generatedAt: now.toISOString(),
  };
}

/**
 * Coleta das amostras de saúde.
 *
 * Pega carona no `/api/health`, que o healthcheck do Docker chama a cada 15 segundos — o
 * mesmo truque que o vigia da sincronização já usa. Sem agendador novo, sem container novo,
 * e com a garantia de que roda enquanto a aplicação estiver de pé.
 *
 * Três regras, todas por não poder atrapalhar o healthcheck:
 *
 *  1. **nunca lança.** Falha ao amostrar não pode fazer o Docker julgar o container doente
 *     e reiniciá-lo — seria uma queda causada pela própria medição;
 *  2. **cadência própria.** O healthcheck bate a cada 15s; a amostra é a cada
 *     `HEALTH_SAMPLE_INTERVAL_MINUTES`. O intervalo é guardado em memória, então reinício do
 *     processo produz uma amostra imediata — e é bom que produza: o reinício aparece na
 *     série;
 *  3. **prazo curto.** O healthcheck desiste em 5 segundos; a coleta inteira cabe em bem
 *     menos, e desiste sozinha se não couber.
 */

import { logger } from "@/lib/logger";
import { healthSampleRepository } from "@/repositories/health-sample.repository";
import { adminHealthService } from "@/services/admin-health.service";
import { adminMetricsService } from "@/services/admin-metrics.service";
import { syncHealthService } from "@/services/sync-health.service";
import type { HealthCheck } from "@/types/admin";

const INTERVAL_MS = Number(process.env.HEALTH_SAMPLE_INTERVAL_MINUTES ?? 5) * 60 * 1000;
const RETENTION_DAYS = Number(process.env.HEALTH_SAMPLE_RETENTION_DAYS ?? 90);
/** Teto para a coleta inteira. O healthcheck do Docker desiste em 5s. */
const BUDGET_MS = 3000;

/** Última coleta, em memória. Ver a regra 2 no topo. */
let lastSampleAt = 0;
/** Contador para o expurgo não rodar a cada amostra. */
let sincePrune = 0;

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000);
}

function fieldOf(
  checks: HealthCheck[],
  key: string,
  field: "latencyMs" | "ageHours",
): number | null {
  return checks.find((check) => check.key === key)?.[field] ?? null;
}

export const healthSampleService = {
  /** Grava uma amostra se já passou o intervalo. Silenciosa e sem exceções. */
  async collectIfDue(): Promise<void> {
    if (Date.now() - lastSampleAt < INTERVAL_MS) return;
    lastSampleAt = Date.now();

    try {
      await Promise.race([
        collect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("coleta excedeu o prazo")), BUDGET_MS),
        ),
      ]);
    } catch (error) {
      logger.warn("Amostra de saúde não gravada", { error: (error as Error).message });
    }
  },
};

async function collect(): Promise<void> {
  const [health, sync, metrics] = await Promise.all([
    adminHealthService.summary(),
    syncHealthService.snapshot(),
    // Cache de 60s: a cobertura muda algumas vezes por dia, não a cada amostra.
    adminMetricsService.summary().catch(() => null),
  ]);

  await healthSampleRepository.create({
    status: health.status,
    databaseMs: fieldOf(health.checks, "database", "latencyMs"),
    cacheMs: fieldOf(health.checks, "cache", "latencyMs"),
    syncAgeHours: hoursSince(sync.lastSuccessAt),
    syncFailures: sync.failures,
    backupAgeHours: fieldOf(health.checks, "backup", "ageHours"),
    coverage: metrics?.coverage.fundamentalsRatio ?? null,
    uptimeSeconds: health.uptimeSeconds,
  });

  // Uma vez a cada ~12 amostras (uma hora, na cadência padrão).
  if (++sincePrune >= 12) {
    sincePrune = 0;
    const before = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await healthSampleRepository.prune(before).catch(() => null);
  }
}

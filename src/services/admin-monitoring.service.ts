/**
 * Série histórica de saúde para o painel.
 *
 * Leitura pura: agrega o que a coleta gravou e não mede nada por conta própria. Quem mede é
 * o `healthSampleService`, na carona do healthcheck.
 */

import { healthSampleRepository } from "@/repositories/health-sample.repository";
import {
  availability,
  expectedSamples,
  rangeConfig,
  rangeStart,
  type MonitoringRange,
} from "@/utils/monitoring-window";
import type { MonitoringSeries } from "@/types/admin";

const INTERVAL_MINUTES = Number(process.env.HEALTH_SAMPLE_INTERVAL_MINUTES ?? 5);

export const adminMonitoringService = {
  async series(range: MonitoringRange): Promise<MonitoringSeries> {
    const config = rangeConfig(range);
    const points = await healthSampleRepository.series(rangeStart(range, new Date()), config.bucket);

    return {
      range,
      rangeLabel: config.label,
      points,
      availability: availability(points, expectedSamples(range, INTERVAL_MINUTES)),
      intervalMinutes: INTERVAL_MINUTES,
    };
  },
};

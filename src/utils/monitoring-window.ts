/**
 * Regras da janela de monitoramento — puro, sem I/O.
 *
 * Duas decisões moram aqui, e as duas mudam o que a pessoa entende ao olhar o gráfico:
 * qual granularidade cada janela usa, e como uma série com buracos vira percentual de
 * disponibilidade.
 */

import type { HealthBucket } from "@/repositories/health-sample.repository";

export type MonitoringRange = "24h" | "7d" | "30d";

const HOUR_MS = 60 * 60 * 1000;

const RANGES: Record<MonitoringRange, { hours: number; bucket: "hour" | "day"; label: string }> = {
  "24h": { hours: 24, bucket: "hour", label: "24 horas" },
  // Sete dias por hora dariam 168 pontos — ainda legível, e esconder as horas apagaria
  // justamente o padrão que interessa: a lentidão que só aparece de madrugada.
  "7d": { hours: 7 * 24, bucket: "hour", label: "7 dias" },
  "30d": { hours: 30 * 24, bucket: "day", label: "30 dias" },
};

export function rangeConfig(range: MonitoringRange) {
  return RANGES[range];
}

export function rangeStart(range: MonitoringRange, now: Date): Date {
  return new Date(now.getTime() - RANGES[range].hours * HOUR_MS);
}

/**
 * Quantas amostras a janela deveria ter, dado o intervalo de coleta.
 *
 * É o denominador da disponibilidade. Sem ele, uma queda de seis horas — em que **nenhuma**
 * amostra foi gravada, porque o banco que as guarda estava fora — apareceria como 100%: a
 * série teria só pontos saudáveis, e a ausência dos outros passaria por não ter acontecido
 * nada. Contar contra o esperado é o que faz o buraco significar algo.
 */
export function expectedSamples(range: MonitoringRange, intervalMinutes: number): number {
  return Math.max(1, Math.round((RANGES[range].hours * 60) / intervalMinutes));
}

export interface Availability {
  /** Fração de 0 a 1. */
  ratio: number;
  collected: number;
  expected: number;
  degraded: number;
  /** Amostras que faltaram — indisponibilidade provável, não confirmada. */
  missing: number;
}

/**
 * Disponibilidade da janela.
 *
 * Saudável = amostra gravada **e** com estado `ok`. Amostra que faltou conta como não
 * saudável; amostra em `warn` também, porque a plataforma degradada não é a plataforma no ar.
 *
 * O resultado é uma estimativa, e a tela diz isso: só existe registro do que foi medido.
 */
export function availability(buckets: HealthBucket[], expected: number): Availability {
  const collected = buckets.reduce((total, bucket) => total + bucket.samples, 0);
  const degraded = buckets.reduce((total, bucket) => total + bucket.degraded, 0);
  const missing = Math.max(0, expected - collected);

  const healthy = Math.max(0, collected - degraded);
  const ratio = expected === 0 ? 1 : Math.min(1, healthy / expected);

  return { ratio, collected, expected, degraded, missing };
}

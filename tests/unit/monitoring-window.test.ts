import { describe, expect, it } from "vitest";
import {
  availability,
  expectedSamples,
  rangeConfig,
  rangeStart,
} from "@/utils/monitoring-window";
import type { HealthBucket } from "@/repositories/health-sample.repository";

const AGORA = new Date("2026-08-03T12:00:00.000Z");

function balde(overrides: Partial<HealthBucket> = {}): HealthBucket {
  return {
    at: "2026-08-03T11:00:00.000Z",
    samples: 12,
    degraded: 0,
    databaseMsAvg: 8,
    databaseMsMax: 20,
    cacheMsAvg: 2,
    syncFailuresMax: 0,
    coverageAvg: 0.42,
    ...overrides,
  };
}

describe("janelas", () => {
  it("agrupa por hora nas janelas curtas e por dia em 30 dias", () => {
    // 30 dias por hora dariam 720 pontos — ilegível. Sete dias por hora ainda cabem, e
    // esconder as horas apagaria o padrão que mais importa: a lentidão de madrugada.
    expect(rangeConfig("24h").bucket).toBe("hour");
    expect(rangeConfig("7d").bucket).toBe("hour");
    expect(rangeConfig("30d").bucket).toBe("day");
  });

  it("recua o início pela duração da janela", () => {
    expect(rangeStart("24h", AGORA).toISOString()).toBe("2026-08-02T12:00:00.000Z");
    expect(rangeStart("7d", AGORA).toISOString()).toBe("2026-07-27T12:00:00.000Z");
  });

  it("calcula quantas amostras a janela deveria ter", () => {
    expect(expectedSamples("24h", 5)).toBe(288);
    expect(expectedSamples("7d", 5)).toBe(2016);
    expect(expectedSamples("24h", 15)).toBe(96);
  });
});

describe("disponibilidade", () => {
  it("tudo coletado e saudável dá 100%", () => {
    const buckets = Array.from({ length: 24 }, () => balde());
    const resultado = availability(buckets, 288);

    expect(resultado.ratio).toBe(1);
    expect(resultado.missing).toBe(0);
  });

  /**
   * O caso que justifica a função existir.
   *
   * Numa queda do banco nenhuma amostra é gravada — é o banco que as guarda. Contar só o
   * que foi coletado daria 100% justamente na janela do incidente: a série teria apenas
   * pontos saudáveis, e a ausência dos outros passaria por não ter acontecido nada.
   */
  it("amostra que faltou conta contra, não some da conta", () => {
    const buckets = Array.from({ length: 12 }, () => balde());
    const resultado = availability(buckets, 288);

    expect(resultado.collected).toBe(144);
    expect(resultado.missing).toBe(144);
    expect(resultado.ratio).toBe(0.5);
  });

  it("amostra degradada não conta como saudável", () => {
    const buckets = [balde({ samples: 100, degraded: 25 })];
    const resultado = availability(buckets, 100);

    expect(resultado.degraded).toBe(25);
    expect(resultado.ratio).toBe(0.75);
  });

  it("nunca passa de 100%, mesmo com mais amostras que o esperado", () => {
    // Reinício do processo produz uma amostra imediata, fora da cadência.
    const buckets = [balde({ samples: 320, degraded: 0 })];

    expect(availability(buckets, 288).ratio).toBe(1);
  });

  it("janela sem amostra nenhuma não vira divisão por zero", () => {
    expect(availability([], 0).ratio).toBe(1);
    expect(availability([], 288).ratio).toBe(0);
  });
});

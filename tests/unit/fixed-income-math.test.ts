import { describe, expect, it } from "vitest";
import {
  accumulateDaily,
  accumulateMonthly,
  annualToPeriod,
  businessDaysBetween,
  describeRemuneration,
  unitValueAt,
  type FixedIncomeCurve,
} from "@/utils/fixed-income-math";

function utc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Série diária sintética: taxa fixa em todos os dias úteis do intervalo. */
function dailySeries(from: string, to: string, rate: number) {
  const series = [];
  const end = utc(to).getTime();
  for (let time = utc(from).getTime(); time <= end; time += 24 * 60 * 60 * 1000) {
    const date = new Date(time);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) series.push({ date, rate });
  }
  return series;
}

const EMPTY_CURVE: FixedIncomeCurve = { daily: [], monthlyIpca: [] };

describe("dias úteis", () => {
  it("conta apenas dias úteis e exclui a data inicial", () => {
    // 06/07/2026 é segunda; até sexta 10/07 são 4 dias úteis após o início.
    expect(businessDaysBetween(utc("2026-07-06"), utc("2026-07-10"))).toBe(4);
    // Sexta a segunda: só um dia útil, o fim de semana não conta.
    expect(businessDaysBetween(utc("2026-07-10"), utc("2026-07-13"))).toBe(1);
    expect(businessDaysBetween(utc("2026-07-10"), utc("2026-07-10"))).toBe(0);
    expect(businessDaysBetween(utc("2026-07-10"), utc("2026-07-01"))).toBe(0);
  });
});

describe("pós-fixado", () => {
  it("aplica o percentual contratado sobre a taxa do dia", () => {
    const series = dailySeries("2026-07-01", "2026-07-10", 0.04);

    const cem = accumulateDaily(series, utc("2026-07-06"), utc("2026-07-10"), 1);
    const centoEDez = accumulateDaily(series, utc("2026-07-06"), utc("2026-07-10"), 1.1);

    // 4 dias úteis a 0,04% ao dia.
    expect(cem).toBeCloseTo(1.0004 ** 4, 10);
    // 110% incide sobre a taxa diária: 0,044% ao dia.
    expect(centoEDez).toBeCloseTo(1.00044 ** 4, 10);
  });

  it("ignora pontos fora da janela", () => {
    const series = dailySeries("2026-06-01", "2026-07-31", 0.05);
    const janela = accumulateDaily(series, utc("2026-07-06"), utc("2026-07-10"), 1);
    expect(janela).toBeCloseTo(1.0005 ** 4, 10);
  });

  it("sem série, devolve o valor aplicado em vez de inventar rendimento", () => {
    const valor = unitValueAt(
      { indexer: "CDI", indexPercent: 110, spreadPercent: null, startDate: utc("2026-01-01") },
      EMPTY_CURVE,
      utc("2026-07-31"),
    );
    expect(valor).toBe(1);
  });
});

describe("prefixado", () => {
  it("usa base 252 dias úteis", () => {
    expect(annualToPeriod(12, 252)).toBeCloseTo(1.12, 10);
    expect(annualToPeriod(12, 126)).toBeCloseTo(1.12 ** 0.5, 10);
    expect(annualToPeriod(0, 252)).toBe(1);
  });

  it("valor unitário cresce pela taxa contratada", () => {
    const valor = unitValueAt(
      { indexer: "PREFIXADO", indexPercent: null, spreadPercent: 12, startDate: utc("2026-07-06") },
      EMPTY_CURVE,
      utc("2026-07-10"),
    );
    expect(valor).toBeCloseTo(1.12 ** (4 / 252), 10);
  });
});

describe("IPCA", () => {
  const curve: FixedIncomeCurve = {
    daily: [],
    monthlyIpca: [
      { date: utc("2026-05-01"), rate: 0.5 },
      { date: utc("2026-06-01"), rate: 0.4 },
      { date: utc("2026-07-01"), rate: 0.3 },
    ],
  };

  it("acumula só os meses dentro da janela", () => {
    const fator = accumulateMonthly(curve.monthlyIpca, utc("2026-05-01"), utc("2026-07-01"));
    expect(fator).toBeCloseTo(1.004 * 1.003, 10);
  });

  it("soma o juro real por cima da inflação", () => {
    const valor = unitValueAt(
      { indexer: "IPCA", indexPercent: null, spreadPercent: 6, startDate: utc("2026-05-01") },
      curve,
      utc("2026-07-01"),
    );

    const diasUteis = businessDaysBetween(utc("2026-05-01"), utc("2026-07-01"));
    expect(valor).toBeCloseTo(1.004 * 1.003 * 1.06 ** (diasUteis / 252), 10);
  });
});

describe("valor unitário", () => {
  it("é 1,00 na data de início e antes dela", () => {
    const terms = {
      indexer: "CDI" as const,
      indexPercent: 100,
      spreadPercent: null,
      startDate: utc("2026-07-06"),
    };
    const curve: FixedIncomeCurve = { daily: dailySeries("2026-07-01", "2026-07-31", 0.05), monthlyIpca: [] };

    expect(unitValueAt(terms, curve, utc("2026-07-06"))).toBe(1);
    expect(unitValueAt(terms, curve, utc("2026-07-01"))).toBe(1);
    expect(unitValueAt(terms, curve, utc("2026-07-10"))).toBeGreaterThan(1);
  });
});

describe("rótulo da remuneração", () => {
  it("descreve cada formato de contrato", () => {
    expect(
      describeRemuneration({ indexer: "CDI", indexPercent: 110, spreadPercent: null, startDate: new Date() }),
    ).toBe("110% do CDI");

    expect(
      describeRemuneration({ indexer: "IPCA", indexPercent: null, spreadPercent: 6, startDate: new Date() }),
    ).toBe("IPCA + 6,00% a.a.");

    expect(
      describeRemuneration({ indexer: "PREFIXADO", indexPercent: null, spreadPercent: 12.5, startDate: new Date() }),
    ).toBe("12,50% a.a.");

    expect(
      describeRemuneration({ indexer: "SELIC", indexPercent: 100, spreadPercent: null, startDate: new Date() }),
    ).toBe("100% do Selic");
  });
});

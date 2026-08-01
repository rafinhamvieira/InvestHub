import { describe, expect, it } from "vitest";
import {
  isinMatchesTicker,
  mapB3CashDividends,
  parseB3Date,
  parseB3Rate,
} from "@/services/market-data/b3.provider";
import { mapYahooDividends } from "@/services/market-data/yahoo.provider";

describe("B3 — parsing", () => {
  it("converte valor em formato brasileiro", () => {
    expect(parseB3Rate("0,35048636000")).toBeCloseTo(0.35048636, 8);
    expect(parseB3Rate("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseB3Rate(null)).toBeNull();
    expect(parseB3Rate("0")).toBeNull();
  });

  it("converte data dd/MM/yyyy para meia-noite UTC", () => {
    const date = parseB3Date("01/06/2026")!;
    expect(date.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(parseB3Date("2026-06-01")).toBeNull();
  });
});

describe("B3 — separação por classe de ação", () => {
  it("associa o ISIN à espécie certa do ticker", () => {
    expect(isinMatchesTicker("BRPETRACNOR9", "PETR3")).toBe(true);
    expect(isinMatchesTicker("BRPETRACNOR9", "PETR4")).toBe(false);
    expect(isinMatchesTicker("BRPETRACNPR6", "PETR4")).toBe(true);
    expect(isinMatchesTicker("BRTAEEUNT002", "TAEE11")).toBe(true);
    expect(isinMatchesTicker("BRMXRFCTF008", "MXRF11")).toBe(true);
  });

  it("aceita o registro quando o ISIN não identifica a espécie", () => {
    expect(isinMatchesTicker(null, "WEGE3")).toBe(true);
    expect(isinMatchesTicker("BRWEGEXXXXX0", "WEGE3")).toBe(true);
  });

  it("filtra o retorno da empresa pelo ticker pedido", () => {
    const records = [
      {
        isinCode: "BRPETRACNOR9",
        rate: "0,35048636000",
        lastDatePrior: "01/06/2026",
        paymentDate: "20/08/2026",
        approvedOn: "11/05/2026",
        label: "JRS CAP PROPRIO",
      },
      {
        isinCode: "BRPETRACNPR6",
        rate: "0,40000000000",
        lastDatePrior: "01/06/2026",
        paymentDate: "20/08/2026",
        approvedOn: "11/05/2026",
        label: "DIVIDENDO",
      },
    ];

    const pn = mapB3CashDividends("PETR4", records);
    expect(pn).toHaveLength(1);
    expect(pn[0]!.valuePerShare).toBe(0.4);
    expect(pn[0]!.type).toBe("DIVIDENDO");
    expect(pn[0]!.paymentDate!.toISOString().slice(0, 10)).toBe("2026-08-20");
    expect(pn[0]!.declaredAt!.toISOString().slice(0, 10)).toBe("2026-05-11");

    expect(mapB3CashDividends("PETR3", records)).toHaveLength(1);
  });

  it("descarta registros sem valor ou sem data-com", () => {
    const mapped = mapB3CashDividends("MXRF11", [
      { isinCode: "BRMXRFCTF008", rate: null, lastDatePrior: "30/06/2026" },
      { isinCode: "BRMXRFCTF008", rate: "0,10000000000", lastDatePrior: null },
    ]);
    expect(mapped).toHaveLength(0);
  });
});

describe("Yahoo — histórico", () => {
  it("converte data-ex em data-com (dia útil anterior)", () => {
    // 2026-07-01 é uma quarta-feira: data-com cai na terça.
    const [quarta] = mapYahooDividends({
      "1": { date: Date.UTC(2026, 6, 1) / 1000, amount: 0.1 },
    });
    expect(quarta!.exDate.toISOString().slice(0, 10)).toBe("2026-06-30");

    // 2026-06-01 é segunda: a data-com pula o fim de semana e cai na sexta.
    const [segunda] = mapYahooDividends({
      "1": { date: Date.UTC(2026, 5, 1) / 1000, amount: 0.2 },
    });
    expect(segunda!.exDate.toISOString().slice(0, 10)).toBe("2026-05-29");
  });

  it("ignora eventos inválidos e ordena do mais antigo ao mais recente", () => {
    const mapped = mapYahooDividends({
      a: { date: Date.UTC(2026, 6, 1) / 1000, amount: 0.1 },
      b: { date: Date.UTC(2025, 6, 1) / 1000, amount: 0.2 },
      c: { date: Date.UTC(2024, 6, 1) / 1000, amount: 0 },
      d: { amount: 0.5 },
    });

    expect(mapped).toHaveLength(2);
    expect(mapped[0]!.exDate.getUTCFullYear()).toBe(2025);
    expect(mapped[1]!.exDate.getUTCFullYear()).toBe(2026);
    expect(mapped[0]!.paymentDate).toBeNull();
  });
});

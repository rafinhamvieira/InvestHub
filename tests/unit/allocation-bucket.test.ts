import { describe, expect, it } from "vitest";
import { sectorBucket } from "@/utils/allocation-bucket";

describe("agrupamento por setor", () => {
  it("usa o segmento do fundo para FIIs, não o setor", () => {
    expect(
      sectorBucket({ type: "FII", sector: "Fundos Imobiliários", segment: "Logística" }),
    ).toBe("Logística");
    expect(sectorBucket({ type: "FII", sector: "Fundos Imobiliários", segment: null })).toBe(
      "FIIs sem segmento",
    );
    expect(sectorBucket({ type: "FII", sector: "Fundos Imobiliários", segment: "  " })).toBe(
      "FIIs sem segmento",
    );
  });

  it("mantém o setor das ações e BDRs", () => {
    expect(sectorBucket({ type: "STOCK", sector: "Petróleo e Gás", segment: null })).toBe(
      "Petróleo e Gás",
    );
    expect(sectorBucket({ type: "BDR", sector: "Tecnologia da Informação" })).toBe(
      "Tecnologia da Informação",
    );
    expect(sectorBucket({ type: "STOCK", sector: null })).toBe("Outros");
  });

  it("dá rótulo próprio a classes que não têm setor", () => {
    expect(sectorBucket({ type: "TREASURY", sector: null })).toBe("Tesouro Direto");
    expect(sectorBucket({ type: "ETF", sector: null })).toBe("ETFs");
    // ETF com setor herdado da fonte continua sendo ETF.
    expect(sectorBucket({ type: "ETF", sector: "Finance" })).toBe("ETFs");
  });
});

import { describe, expect, it } from "vitest";
import { sectorBucket } from "@/utils/allocation-bucket";

describe("agrupamento por setor", () => {
  it("usa o segmento do fundo para FIIs, não o setor", () => {
    expect(
      sectorBucket({ type: "FII", sector: "Fundos Imobiliários", segment: "Logística" }),
    ).toBe("Logística");
    // Sem segmento não há setor a mostrar: o fundo fica fora do gráfico.
    expect(sectorBucket({ type: "FII", sector: "Fundos Imobiliários", segment: null })).toBeNull();
    expect(sectorBucket({ type: "FII", sector: "Fundos Imobiliários", segment: "  " })).toBeNull();
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

  it("deixa fora do gráfico o que não tem setor por natureza", () => {
    expect(sectorBucket({ type: "TREASURY", sector: null })).toBeNull();
    expect(sectorBucket({ type: "ETF", sector: null })).toBeNull();
    // Mesmo com setor vindo da fonte, ETF é cesta de vários setores: continua fora.
    expect(sectorBucket({ type: "ETF", sector: "Finance" })).toBeNull();
  });
});

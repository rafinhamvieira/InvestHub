import { describe, expect, it } from "vitest";
import {
  grahamFairPrice,
  bazinCeilingPrice,
  lynchFairPrice,
  dcfFairPrice,
  earningsYield,
  lpaFromPl,
  vpaFromPvp,
  safetyMargin,
} from "@/utils/valuation-math";

describe("grahamFairPrice", () => {
  it("calcula sqrt(22.5 * LPA * VPA)", () => {
    // LPA 4, VPA 10 → sqrt(22.5*40) = 30
    expect(grahamFairPrice(4, 10)).toBeCloseTo(30);
  });

  it("retorna null para LPA/VPA não positivos", () => {
    expect(grahamFairPrice(-1, 10)).toBeNull();
    expect(grahamFairPrice(4, 0)).toBeNull();
  });
});

describe("bazinCeilingPrice", () => {
  it("teto = dividendos anuais / yield mínimo", () => {
    expect(bazinCeilingPrice(3, 0.06)).toBeCloseTo(50);
  });

  it("null sem dividendos", () => {
    expect(bazinCeilingPrice(0, 0.06)).toBeNull();
  });
});

describe("lynchFairPrice", () => {
  it("fair = LPA × crescimento%", () => {
    expect(lynchFairPrice(2, 0.1)).toBeCloseTo(20);
  });

  it("limita crescimento a 25%", () => {
    expect(lynchFairPrice(2, 0.4)).toBeCloseTo(50);
  });

  it("null sem crescimento positivo", () => {
    expect(lynchFairPrice(2, 0)).toBeNull();
  });
});

describe("dcfFairPrice", () => {
  it("cresce, desconta e soma valor terminal", () => {
    const fair = dcfFairPrice({
      baseCashflow: 5,
      growthRate: 0.05,
      discountRate: 0.12,
      perpetuityGrowthRate: 0.03,
      projectionYears: 10,
    });
    expect(fair).not.toBeNull();
    // Sanidade: deve valer mais que 10 anos de fluxo sem desconto? Não — mas > fluxo base × anos descontados.
    expect(fair!).toBeGreaterThan(30);
    expect(fair!).toBeLessThan(200);
  });

  it("null quando desconto ≤ perpetuidade (Gordon inválido)", () => {
    expect(
      dcfFairPrice({
        baseCashflow: 5,
        growthRate: 0.05,
        discountRate: 0.03,
        perpetuityGrowthRate: 0.03,
        projectionYears: 10,
      }),
    ).toBeNull();
  });

  it("com desconto alto, valor converge para baixo", () => {
    const low = dcfFairPrice({
      baseCashflow: 5,
      growthRate: 0.05,
      discountRate: 0.2,
      perpetuityGrowthRate: 0.03,
      projectionYears: 10,
    })!;
    const high = dcfFairPrice({
      baseCashflow: 5,
      growthRate: 0.05,
      discountRate: 0.1,
      perpetuityGrowthRate: 0.03,
      projectionYears: 10,
    })!;
    expect(low).toBeLessThan(high);
  });
});

describe("derivações e utilitários", () => {
  it("LPA e VPA derivados de preço e múltiplos", () => {
    expect(lpaFromPl(30, 10)).toBeCloseTo(3);
    expect(vpaFromPvp(30, 1.5)).toBeCloseTo(20);
    expect(lpaFromPl(30, 0)).toBeNull();
  });

  it("earnings yield = 1/(EV/EBIT)", () => {
    expect(earningsYield(8)).toBeCloseTo(0.125);
    expect(earningsYield(0)).toBeNull();
  });

  it("margem de segurança positiva quando barato", () => {
    expect(safetyMargin(80, 100)).toBeCloseTo(0.2);
    expect(safetyMargin(120, 100)).toBeCloseTo(-0.2);
  });
});

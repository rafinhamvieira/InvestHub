import { describe, expect, it } from "vitest";
import {
  computeAssetScore,
  ratingFor,
  DEFAULT_WEIGHTS,
  type ScoreInput,
} from "@/utils/score-engine";
import type { ScoreWeights } from "@/types/score";

const EMPTY: ScoreInput = {
  price: null,
  pl: null,
  pvp: null,
  dividendYield: null,
  roe: null,
  netMargin: null,
  ebitdaMargin: null,
  netDebtEbitda: null,
  liquidity: null,
  tagAlong: null,
  freeFloat: null,
  dividendYears: null,
};

function input(overrides: Partial<ScoreInput>): ScoreInput {
  return { ...EMPTY, ...overrides };
}

describe("computeAssetScore", () => {
  it("retorna null e NO_DATA quando não há nenhum indicador", () => {
    const result = computeAssetScore(EMPTY);
    expect(result.score).toBeNull();
    expect(result.rating).toBe("NO_DATA");
    expect(result.coverage).toBe(0);
  });

  it("nota alta para empresa barata, rentável e pouco endividada", () => {
    // Preço 20, LPA 4 (P/L 5), VPA 20 (P/VP 1) → justo Graham ≈ 42 → margem grande.
    const result = computeAssetScore(
      input({
        price: 20,
        pl: 5,
        pvp: 1,
        dividendYield: 10,
        roe: 24,
        netMargin: 20,
        ebitdaMargin: 30,
        netDebtEbitda: 0.5,
        liquidity: 20_000_000,
        tagAlong: 100,
        freeFloat: 30,
        dividendYears: 5,
      }),
    );
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(80);
    expect(result.rating).toBe("EXCELLENT");
    expect(result.coverage).toBe(100);
  });

  it("nota baixa para empresa cara, pouco rentável e endividada", () => {
    const result = computeAssetScore(
      input({
        price: 100,
        pl: 40,
        pvp: 8,
        dividendYield: 0.5,
        roe: 2,
        netMargin: 1,
        ebitdaMargin: 3,
        netDebtEbitda: 5,
        liquidity: 100_000,
        tagAlong: 0,
        freeFloat: 6,
        dividendYears: 1,
      }),
    );
    expect(result.score!).toBeLessThan(30);
    expect(result.rating).toBe("WEAK");
  });

  it("empresa com prejuízo zera o critério de P/L", () => {
    const result = computeAssetScore(input({ price: 10, pl: -3 }));
    const pl = result.breakdown.find((c) => c.key === "pl")!;
    expect(pl.score).toBe(0);
    expect(pl.explanation).toContain("prejuízo");
  });

  it("critérios sem dados não entram na média e reduzem a cobertura", () => {
    // Só ROE disponível: nota deve refletir apenas ROE, cobertura = peso do ROE / total.
    const result = computeAssetScore(input({ roe: 25 }));
    expect(result.score).toBe(100);
    const expectedCoverage = Math.round(
      (DEFAULT_WEIGHTS.roe /
        Object.values(DEFAULT_WEIGHTS).reduce((sum, w) => sum + w, 0)) *
        100,
    );
    expect(result.coverage).toBe(expectedCoverage);
  });

  it("pesos personalizados mudam a nota final", () => {
    const data = input({ roe: 25, dividendYield: 0 });

    const roeHeavy: ScoreWeights = { ...DEFAULT_WEIGHTS, roe: 100, dividendYield: 0 };
    const dyHeavy: ScoreWeights = { ...DEFAULT_WEIGHTS, roe: 0, dividendYield: 100 };

    const roeScore = computeAssetScore(data, roeHeavy).score!;
    const dyScore = computeAssetScore(data, dyHeavy).score!;

    expect(roeScore).toBeGreaterThan(dyScore);
  });

  it("peso zero exclui o critério da nota", () => {
    const data = input({ roe: 0, dividendYield: 12 });
    const withoutRoe = computeAssetScore(data, {
      ...DEFAULT_WEIGHTS,
      roe: 0,
      valuation: 0,
      pl: 0,
      margins: 0,
      debt: 0,
      priceSafetyMargin: 0,
      dividendHistory: 0,
      liquidity: 0,
      governance: 0,
    });
    expect(withoutRoe.score).toBe(100);
  });

  it("breakdown traz todos os critérios com explicação", () => {
    const result = computeAssetScore(input({ roe: 18 }));
    expect(result.breakdown).toHaveLength(10);
    const roe = result.breakdown.find((c) => c.key === "roe")!;
    expect(roe.explanation).toContain("18");
    expect(roe.label).toBe("ROE");
  });

  it("histórico de dividendos satura em 5 anos", () => {
    const full = computeAssetScore(input({ dividendYears: 5 })).breakdown.find(
      (c) => c.key === "dividendHistory",
    )!;
    const partial = computeAssetScore(input({ dividendYears: 2 })).breakdown.find(
      (c) => c.key === "dividendHistory",
    )!;
    expect(full.score).toBe(100);
    expect(partial.score).toBe(40);
  });

  it("caixa líquido recebe nota máxima em endividamento", () => {
    const debt = computeAssetScore(input({ netDebtEbitda: -1 })).breakdown.find(
      (c) => c.key === "debt",
    )!;
    expect(debt.score).toBe(100);
    expect(debt.explanation).toContain("Caixa líquido");
  });
});

describe("ratingFor", () => {
  it("classifica por faixas", () => {
    expect(ratingFor(85)).toBe("EXCELLENT");
    expect(ratingFor(65)).toBe("GOOD");
    expect(ratingFor(45)).toBe("FAIR");
    expect(ratingFor(20)).toBe("WEAK");
    expect(ratingFor(null)).toBe("NO_DATA");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildContributionPlan,
  type EngineAsset,
  type TargetSet,
} from "@/utils/contribution-engine";
import type { StrategyConfig } from "@/types/contribution";

const REBALANCE_ONLY: StrategyConfig = {
  rebalance: true,
  belowFair: false,
  belowCeiling: false,
  safetyMargin: false,
  dividendYield: false,
};

function asset(partial: Partial<EngineAsset> & Pick<EngineAsset, "assetId" | "ticker">): EngineAsset {
  return {
    name: partial.ticker,
    assetClass: "STOCK",
    classLabel: "Ações",
    sector: null,
    price: 10,
    currentValue: 0,
    fairPrice: null,
    ceilingPrice: null,
    dividendYield: null,
    ...partial,
  };
}

function targets(partial: Partial<TargetSet> = {}): TargetSet {
  return {
    byAsset: partial.byAsset ?? new Map(),
    byClass: partial.byClass ?? new Map(),
    bySector: partial.bySector ?? new Map(),
  };
}

describe("buildContributionPlan — rebalanceamento", () => {
  it("prioriza o ativo mais abaixo da meta", () => {
    // A: meta 50%, tem 100. B: meta 50%, tem 900. B está muito acima.
    const plan = buildContributionPlan(
      [
        asset({ assetId: "A", ticker: "AAAA3", price: 10, currentValue: 100 }),
        asset({ assetId: "B", ticker: "BBBB3", price: 10, currentValue: 900 }),
      ],
      targets({
        byAsset: new Map([
          ["A", 0.5],
          ["B", 0.5],
        ]),
      }),
      500,
      REBALANCE_ONLY,
    );

    const itemA = plan.items.find((i) => i.assetId === "A");
    const itemB = plan.items.find((i) => i.assetId === "B");
    expect(itemA).toBeDefined();
    expect(itemA!.invested).toBe(500);
    expect(itemB).toBeUndefined();
  });

  it("nunca estoura o orçamento e respeita quantidades inteiras", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 33, currentValue: 0 })],
      targets({ byAsset: new Map([["A", 1]]) }),
      100,
      REBALANCE_ONLY,
    );

    const item = plan.items[0]!;
    expect(item.quantity).toBe(3);
    expect(plan.spent).toBe(99);
    expect(plan.leftover).toBe(1);
    expect(Number.isInteger(item.quantity)).toBe(true);
  });

  it("não compra ativo acima da meta quando só rebalanceamento está ativo", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 10, currentValue: 1000 })],
      targets({ byAsset: new Map([["A", 0.1]]) }),
      500,
      REBALANCE_ONLY,
    );

    expect(plan.items).toHaveLength(0);
    expect(plan.leftover).toBe(500);
  });

  it("usa metas de classe quando não há meta por ativo", () => {
    const plan = buildContributionPlan(
      [
        asset({ assetId: "A", ticker: "AAAA3", assetClass: "STOCK", price: 10, currentValue: 800 }),
        asset({
          assetId: "F",
          ticker: "FFFF11",
          assetClass: "FII",
          classLabel: "FIIs",
          price: 10,
          currentValue: 200,
        }),
      ],
      targets({
        byClass: new Map([
          ["STOCK", 0.5],
          ["FII", 0.5],
        ]),
      }),
      300,
      REBALANCE_ONLY,
    );

    const fii = plan.items.find((i) => i.assetId === "F");
    expect(fii).toBeDefined();
    expect(fii!.invested).toBe(300);
  });

  it("distribui entre dois ativos abaixo da meta convergindo os pesos", () => {
    const plan = buildContributionPlan(
      [
        asset({ assetId: "A", ticker: "AAAA3", price: 10, currentValue: 300 }),
        asset({ assetId: "B", ticker: "BBBB3", price: 10, currentValue: 300 }),
        asset({ assetId: "C", ticker: "CCCC3", price: 10, currentValue: 400 }),
      ],
      targets({
        byAsset: new Map([
          ["A", 0.4],
          ["B", 0.4],
          ["C", 0.2],
        ]),
      }),
      400,
      REBALANCE_ONLY,
    );

    const investedA = plan.items.find((i) => i.assetId === "A")?.invested ?? 0;
    const investedB = plan.items.find((i) => i.assetId === "B")?.invested ?? 0;
    const investedC = plan.items.find((i) => i.assetId === "C")?.invested ?? 0;
    expect(investedC).toBe(0);
    expect(investedA + investedB).toBe(400);
    // A e B devem receber valores próximos (gaps iguais).
    expect(Math.abs(investedA - investedB)).toBeLessThanOrEqual(10);
  });
});

describe("buildContributionPlan — valuation", () => {
  it("com DY habilitado, prefere o maior pagador", () => {
    const plan = buildContributionPlan(
      [
        asset({ assetId: "A", ticker: "AAAA3", price: 10, currentValue: 0, dividendYield: 0.1 }),
        asset({ assetId: "B", ticker: "BBBB3", price: 10, currentValue: 0, dividendYield: 0.03 }),
      ],
      targets(),
      100,
      { ...REBALANCE_ONLY, rebalance: false, dividendYield: true },
    );

    expect(plan.items[0]!.assetId).toBe("A");
    expect(plan.items[0]!.invested).toBe(100);
  });

  it("gera nota 0-100 e explicações", () => {
    const plan = buildContributionPlan(
      [
        asset({
          assetId: "A",
          ticker: "AAAA3",
          price: 10,
          currentValue: 0,
          fairPrice: 15,
          dividendYield: 0.08,
        }),
      ],
      targets({ byAsset: new Map([["A", 1]]) }),
      50,
      { ...REBALANCE_ONLY, belowFair: true, dividendYield: true },
    );

    const item = plan.items[0]!;
    expect(item.score).toBeGreaterThan(0);
    expect(item.score).toBeLessThanOrEqual(100);
    expect(item.reasons.length).toBeGreaterThan(0);
    expect(item.reasons.some((r) => r.includes("abaixo do justo"))).toBe(true);
  });

  it("ignora ativos sem cotação e gera aviso", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 0 })],
      targets({ byAsset: new Map([["A", 1]]) }),
      100,
      REBALANCE_ONLY,
    );

    expect(plan.items).toHaveLength(0);
    expect(plan.warnings[0]).toContain("AAAA3");
  });
});

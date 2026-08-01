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

describe("diagnóstico de nenhuma compra", () => {
  const semMetas = targets();

  it("aponta falta de metas quando só rebalanceamento está ativo", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 10, currentValue: 100 })],
      semMetas,
      1000,
      REBALANCE_ONLY,
    );
    expect(plan.items).toHaveLength(0);
    expect(plan.reason).toBe("NO_TARGETS");
  });

  it("aponta valor insuficiente quando o aporte não cobre uma cota", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 500 })],
      targets({ byAsset: new Map([["A", 1]]) }),
      100,
      REBALANCE_ONLY,
    );
    expect(plan.reason).toBe("AMOUNT_TOO_SMALL");
  });

  it("aponta carteira já na meta", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 10, currentValue: 1000 })],
      targets({ byAsset: new Map([["A", 0.1]]) }),
      500,
      REBALANCE_ONLY,
    );
    expect(plan.reason).toBe("ALL_ABOVE_TARGET");
  });

  it("aponta ausência de cotação", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 0 })],
      targets({ byAsset: new Map([["A", 1]]) }),
      1000,
      REBALANCE_ONLY,
    );
    expect(plan.reason).toBe("NO_PRICES");
  });

  it("aponta falta de indicadores quando só critérios de valuation estão ativos", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 10 })],
      semMetas,
      1000,
      { ...REBALANCE_ONLY, rebalance: false, dividendYield: true },
    );
    expect(plan.reason).toBe("NO_CRITERIA_DATA");
  });

  it("não reporta motivo quando houve compra", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 10 })],
      targets({ byAsset: new Map([["A", 1]]) }),
      100,
      REBALANCE_ONLY,
    );
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.reason).toBeNull();
  });
});

describe("distribuição entre vários ativos", () => {
  it("divide a meta da classe entre seus ativos em vez de concentrar no mais barato", () => {
    // Meta: 50% FIIs. Dois FIIs com preços muito diferentes — sem meta individual.
    // O barato não pode levar tudo só por ser barato.
    const plan = buildContributionPlan(
      [
        asset({ assetId: "S", ticker: "AAAA3", assetClass: "STOCK", price: 20, currentValue: 4700 }),
        asset({ assetId: "F1", ticker: "FFFF11", assetClass: "FII", price: 10, currentValue: 800 }),
        asset({ assetId: "F2", ticker: "GGGG11", assetClass: "FII", price: 105, currentValue: 500 }),
      ],
      targets({ byClass: new Map([["STOCK", 0.5], ["FII", 0.5]]) }),
      1500,
      REBALANCE_ONLY,
    );

    expect(plan.items.length).toBe(2);
    expect(plan.items.every((i) => i.ticker !== "AAAA3")).toBe(true);
  });

  it("atende primeiro quem está mais longe da meta, mesmo sendo mais caro", () => {
    // F2 tem 500 e F1 tem 800: F2 está mais deficitário e deve receber mais,
    // apesar da cota custar 10x mais.
    const plan = buildContributionPlan(
      [
        asset({ assetId: "F1", ticker: "FFFF11", assetClass: "FII", price: 10, currentValue: 800 }),
        asset({ assetId: "F2", ticker: "GGGG11", assetClass: "FII", price: 105, currentValue: 500 }),
      ],
      targets({ byClass: new Map([["FII", 1]]) }),
      1500,
      REBALANCE_ONLY,
    );

    const f1 = plan.items.find((i) => i.assetId === "F1")!;
    const f2 = plan.items.find((i) => i.assetId === "F2")!;
    expect(f2.invested).toBeGreaterThan(f1.invested);

    // E os dois terminam com pesos próximos — o objetivo do rebalanceamento.
    expect(Math.abs(f1.weightAfter - f2.weightAfter)).toBeLessThan(0.06);
  });
});

describe("limite de concentração por ativo", () => {
  const cinco = [
    asset({ assetId: "A", ticker: "AAAA3", price: 10, dividendYield: 0.12 }),
    asset({ assetId: "B", ticker: "BBBB3", price: 10, dividendYield: 0.11 }),
    asset({ assetId: "C", ticker: "CCCC3", price: 10, dividendYield: 0.1 }),
    asset({ assetId: "D", ticker: "DDDD3", price: 10, dividendYield: 0.09 }),
  ];

  it("sem limite, um critério estático concentra tudo no melhor ativo", () => {
    const plan = buildContributionPlan(cinco, targets(), 10000, {
      ...REBALANCE_ONLY,
      rebalance: false,
      dividendYield: true,
    });
    expect(plan.items).toHaveLength(1);
  });

  it("com limite de 30%, nenhum ativo passa do teto enquanto houver alternativas", () => {
    const plan = buildContributionPlan(
      cinco,
      targets(),
      10000,
      { ...REBALANCE_ONLY, rebalance: false, dividendYield: true },
      { maxPerAssetFraction: 0.3 },
    );
    expect(plan.items.length).toBeGreaterThan(1);
    // O último ativo pode ultrapassar quando o limite é flexibilizado para não sobrar caixa.
    const dentroDoTeto = plan.items.filter((i) => i.invested <= 10000 * 0.3 + 10);
    expect(dentroDoTeto.length).toBeGreaterThanOrEqual(plan.items.length - 1);
  });

  it("flexibiliza o limite em vez de deixar dinheiro parado", () => {
    const plan = buildContributionPlan(
      [asset({ assetId: "A", ticker: "AAAA3", price: 10, dividendYield: 0.12 })],
      targets(),
      10000,
      { ...REBALANCE_ONLY, rebalance: false, dividendYield: true },
      { maxPerAssetFraction: 0.3 },
    );
    expect(plan.spent).toBeGreaterThan(9000);
    expect(plan.warnings.some((w) => w.includes("flexibilizado"))).toBe(true);
  });

  it("com rebalanceamento, o limite não altera a distribuição por gap", () => {
    const semLimite = buildContributionPlan(
      [
        asset({ assetId: "F1", ticker: "FFFF11", assetClass: "FII", price: 10, currentValue: 800 }),
        asset({ assetId: "F2", ticker: "GGGG11", assetClass: "FII", price: 20, currentValue: 500 }),
      ],
      targets({ byClass: new Map([["FII", 1]]) }),
      5000,
      REBALANCE_ONLY,
    );
    const comLimite = buildContributionPlan(
      [
        asset({ assetId: "F1", ticker: "FFFF11", assetClass: "FII", price: 10, currentValue: 800 }),
        asset({ assetId: "F2", ticker: "GGGG11", assetClass: "FII", price: 20, currentValue: 500 }),
      ],
      targets({ byClass: new Map([["FII", 1]]) }),
      5000,
      REBALANCE_ONLY,
      { maxPerAssetFraction: 0.6 },
    );
    expect(comLimite.spent).toBe(semLimite.spent);
  });
});

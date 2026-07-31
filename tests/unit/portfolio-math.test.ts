import { describe, expect, it } from "vitest";
import {
  computePositions,
  computePositionsAt,
  quantityAt,
  lastMonthEnds,
  type LedgerEntry,
} from "@/utils/portfolio-math";

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "date">): LedgerEntry {
  return {
    assetId: "A1",
    type: "BUY",
    quantity: 100,
    price: 10,
    fees: 0,
    ...partial,
  };
}

describe("computePositions", () => {
  it("consolida uma compra simples", () => {
    const positions = computePositions([entry({ date: new Date("2025-01-10") })]);
    const p = positions.get("A1")!;
    expect(p.quantity).toBe(100);
    expect(p.averagePrice).toBe(10);
    expect(p.totalInvested).toBe(1000);
  });

  it("calcula preço médio ponderado em compras múltiplas", () => {
    const positions = computePositions([
      entry({ date: new Date("2025-01-10"), quantity: 100, price: 10 }),
      entry({ date: new Date("2025-02-10"), quantity: 100, price: 20 }),
    ]);
    const p = positions.get("A1")!;
    expect(p.quantity).toBe(200);
    expect(p.averagePrice).toBe(15);
    expect(p.totalInvested).toBe(3000);
  });

  it("inclui taxas no custo", () => {
    const positions = computePositions([
      entry({ date: new Date("2025-01-10"), quantity: 100, price: 10, fees: 50 }),
    ]);
    expect(positions.get("A1")!.averagePrice).toBeCloseTo(10.5);
  });

  it("venda parcial sai pelo preço médio e mantém o restante", () => {
    const positions = computePositions([
      entry({ date: new Date("2025-01-10"), quantity: 100, price: 10 }),
      entry({ date: new Date("2025-02-10"), type: "SELL", quantity: 40, price: 15 }),
    ]);
    const p = positions.get("A1")!;
    expect(p.quantity).toBe(60);
    expect(p.averagePrice).toBe(10);
    expect(p.totalInvested).toBe(600);
  });

  it("venda total zera a posição", () => {
    const positions = computePositions([
      entry({ date: new Date("2025-01-10") }),
      entry({ date: new Date("2025-02-10"), type: "SELL", quantity: 100, price: 12 }),
    ]);
    const p = positions.get("A1")!;
    expect(p.quantity).toBe(0);
    expect(p.totalInvested).toBe(0);
  });

  it("venda maior que a posição não gera quantidade negativa", () => {
    const positions = computePositions([
      entry({ date: new Date("2025-01-10"), quantity: 50 }),
      entry({ date: new Date("2025-02-10"), type: "SELL", quantity: 100, price: 12 }),
    ]);
    expect(positions.get("A1")!.quantity).toBe(0);
  });
});

describe("computePositionsAt / quantityAt", () => {
  const ledger = [
    entry({ date: new Date("2025-01-10"), quantity: 100 }),
    entry({ date: new Date("2025-03-10"), quantity: 50 }),
    entry({ date: new Date("2025-05-10"), type: "SELL", quantity: 30, price: 12 }),
  ];

  it("ignora transações após a data de corte", () => {
    expect(quantityAt(ledger, "A1", new Date("2025-02-01"))).toBe(100);
    expect(quantityAt(ledger, "A1", new Date("2025-04-01"))).toBe(150);
    expect(quantityAt(ledger, "A1", new Date("2025-06-01"))).toBe(120);
  });

  it("retorna zero antes da primeira compra", () => {
    expect(quantityAt(ledger, "A1", new Date("2024-12-31"))).toBe(0);
  });

  it("posição em data intermediária tem custo correto", () => {
    const p = computePositionsAt(ledger, new Date("2025-04-01")).get("A1")!;
    expect(p.totalInvested).toBe(1500);
  });
});

describe("lastMonthEnds", () => {
  it("retorna N meses terminando no mês de referência", () => {
    const months = lastMonthEnds(3, new Date("2025-06-15"));
    expect(months).toHaveLength(3);
    expect(months[0]!.getMonth()).toBe(3); // abril
    expect(months[2]!.getMonth()).toBe(5); // junho
    expect(months[2]!.getDate()).toBe(30); // fim do mês
  });

  it("cruza a virada de ano corretamente", () => {
    const months = lastMonthEnds(3, new Date("2025-01-15"));
    expect(months[0]!.getFullYear()).toBe(2024);
    expect(months[0]!.getMonth()).toBe(10); // novembro
  });
});

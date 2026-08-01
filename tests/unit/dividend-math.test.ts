import { describe, expect, it } from "vitest";
import {
  buildDividendRows,
  computeTotals,
  filterByPeriod,
  findDuplicate,
  groupByAsset,
  groupByMonth,
  groupByYear,
} from "@/utils/dividend-math";
import type { LedgerEntry } from "@/utils/portfolio-math";
import type { DividendEvent } from "@/types/dividends";

const HOJE = new Date("2026-07-31T12:00:00.000Z");

/** Data de calendário no formato em que o provento trafega na API (ISO). */
function dia(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function utc(date: string): Date {
  return new Date(dia(date));
}

function evento(partial: Partial<DividendEvent> & Pick<DividendEvent, "id" | "exDate">): DividendEvent {
  return {
    assetId: "A",
    ticker: "PETR4",
    name: "Petrobras",
    type: "DIVIDENDO",
    valuePerShare: 1,
    paymentDate: null,
    declaredAt: null,
    ...partial,
  };
}

function compra(assetId: string, date: string, quantity: number, price = 10): LedgerEntry {
  return { assetId, type: "BUY", quantity, price, fees: 0, date: utc(date) };
}

function venda(assetId: string, date: string, quantity: number, price = 10): LedgerEntry {
  return { assetId, type: "SELL", quantity, price, fees: 0, date: utc(date) };
}

describe("deduplicação entre fontes", () => {
  const conhecidos = [
    { id: "1", exDate: utc("2026-06-30"), valuePerShare: 0.1 },
    { id: "2", exDate: utc("2026-05-29"), valuePerShare: 0.35 },
  ];

  it("reconhece o mesmo evento com data e valor levemente diferentes", () => {
    // Yahoo ajustado: 0,099922 em vez de 0,10; data-com um dia à frente.
    const achado = findDuplicate(conhecidos, { exDate: utc("2026-07-01"), valuePerShare: 0.099922 });
    expect(achado?.id).toBe("1");
  });

  it("não confunde proventos distintos", () => {
    expect(findDuplicate(conhecidos, { exDate: utc("2026-06-30"), valuePerShare: 0.5 })).toBeNull();
    expect(findDuplicate(conhecidos, { exDate: utc("2026-03-30"), valuePerShare: 0.1 })).toBeNull();
  });
});

describe("cruzamento com a custódia", () => {
  it("usa a quantidade da data-com, não a de hoje", () => {
    const ledger = [compra("A", "2026-01-10", 100), compra("A", "2026-07-20", 900)];
    const { received } = buildDividendRows(
      [evento({ id: "d1", exDate: dia("2026-03-31"), valuePerShare: 0.5 })],
      ledger,
      HOJE,
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.quantity).toBe(100);
    expect(received[0]!.total).toBe(50);
  });

  it("paga quem vendeu depois da data-com e ignora quem comprou depois", () => {
    const vendeuDepois = buildDividendRows(
      [evento({ id: "d1", exDate: dia("2026-03-31"), valuePerShare: 0.5 })],
      [compra("A", "2026-01-10", 100), venda("A", "2026-04-15", 100)],
      HOJE,
    );
    expect(vendeuDepois.received[0]!.total).toBe(50);

    const comprouDepois = buildDividendRows(
      [evento({ id: "d1", exDate: dia("2026-03-31"), valuePerShare: 0.5 })],
      [compra("A", "2026-04-01", 100)],
      HOJE,
    );
    expect(comprouDepois.received).toHaveLength(0);
  });

  it("separa anunciados a receber e marca estimativa quando a data-com é futura", () => {
    const ledger = [compra("A", "2026-01-10", 200)];
    const { received, upcoming } = buildDividendRows(
      [
        // Data-com passada, pagamento futuro: quantidade travada.
        evento({
          id: "d1",
          exDate: dia("2026-06-01"),
          paymentDate: dia("2026-08-20"),
          valuePerShare: 0.35,
        }),
        // Data-com futura: usa a posição de hoje, marcada como estimativa.
        evento({
          id: "d2",
          exDate: dia("2026-09-01"),
          paymentDate: dia("2026-09-20"),
          valuePerShare: 0.4,
        }),
        evento({ id: "d3", exDate: dia("2026-02-10"), paymentDate: dia("2026-03-10"), valuePerShare: 1 }),
      ],
      ledger,
      HOJE,
    );

    expect(received.map((r) => r.id)).toEqual(["d3"]);
    expect(upcoming.map((r) => r.id)).toEqual(["d1", "d2"]);
    expect(upcoming[0]!.estimated).toBe(false);
    expect(upcoming[1]!.estimated).toBe(true);
    expect(upcoming[0]!.total).toBeCloseTo(70, 6);
  });
});

describe("totais por período", () => {
  const ledger = [compra("A", "2019-01-01", 100)];
  const eventos = [
    evento({ id: "d1", exDate: dia("2026-06-10"), paymentDate: dia("2026-06-20"), valuePerShare: 1 }),
    evento({ id: "d2", exDate: dia("2025-06-10"), paymentDate: dia("2025-06-20"), valuePerShare: 2 }),
    evento({ id: "d3", exDate: dia("2023-06-10"), paymentDate: dia("2023-06-20"), valuePerShare: 3 }),
    evento({ id: "d4", exDate: dia("2020-06-10"), paymentDate: dia("2020-06-20"), valuePerShare: 4 }),
  ];

  it("soma 12m, 2 anos, 5 anos e total pela data de pagamento", () => {
    const { received } = buildDividendRows(eventos, ledger, HOJE);
    const totais = computeTotals(received, HOJE);

    expect(totais.last12m).toBe(100);
    expect(totais.last24m).toBe(300);
    expect(totais.last60m).toBe(600);
    expect(totais.allTime).toBe(1000);
  });

  it("filtra o extrato pela janela escolhida", () => {
    const { received } = buildDividendRows(eventos, ledger, HOJE);
    expect(filterByPeriod(received, 12, HOJE).map((r) => r.id)).toEqual(["d1"]);
    expect(filterByPeriod(received, null, HOJE)).toHaveLength(4);
  });
});

describe("agrupamentos", () => {
  const ledger = [compra("A", "2024-01-01", 100), compra("B", "2024-01-01", 50)];
  const eventos = [
    evento({ id: "d1", exDate: dia("2026-07-05"), paymentDate: dia("2026-07-15"), valuePerShare: 1 }),
    evento({ id: "d2", exDate: dia("2026-06-05"), paymentDate: dia("2026-06-15"), valuePerShare: 2 }),
    evento({
      id: "d3",
      assetId: "B",
      ticker: "MXRF11",
      name: "Maxi Renda",
      type: "RENDIMENTO",
      exDate: dia("2026-07-05"),
      paymentDate: dia("2026-07-15"),
      valuePerShare: 0.1,
    }),
  ];

  it("monta a série mensal incluindo meses sem provento", () => {
    const { received } = buildDividendRows(eventos, ledger, HOJE);
    const serie = groupByMonth(received, 3, HOJE);

    expect(serie.map((p) => p.label)).toEqual(["05/2026", "06/2026", "07/2026"]);
    expect(serie[0]!.total).toBe(0);
    expect(serie[1]!.total).toBe(200);
    expect(serie[2]!.total).toBe(105);
  });

  it("agrupa por ano do mais recente ao mais antigo", () => {
    const { received } = buildDividendRows(eventos, ledger, HOJE);
    expect(groupByYear(received)).toEqual([{ year: 2026, total: 305 }]);
  });

  it("resume por ativo com yield on cost sobre o custo da posição", () => {
    const { received } = buildDividendRows(eventos, ledger, HOJE);
    const resumo = groupByAsset(received, new Map([["A", 1000]]));

    expect(resumo[0]!.ticker).toBe("PETR4");
    expect(resumo[0]!.total).toBe(300);
    expect(resumo[0]!.events).toBe(2);
    expect(resumo[0]!.yieldOnCost).toBeCloseTo(0.3, 6);
    // Ativo sem custo conhecido não ganha yield inventado.
    expect(resumo[1]!.yieldOnCost).toBeNull();
  });
});

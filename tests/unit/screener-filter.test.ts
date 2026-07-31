import { describe, expect, it } from "vitest";
import { applyFilters, applySearch, sortRows } from "@/utils/screener-filter";
import { buildCsv } from "@/utils/csv";
import type { ScreenerRow } from "@/types/screener";

const rows: ScreenerRow[] = [
  { assetId: "1", ticker: "PETR4", name: "Petrobras", favorite: false, pl: 4.2, dy: 12.5, sector: "Petróleo" },
  { assetId: "2", ticker: "VALE3", name: "Vale", favorite: true, pl: 6.8, dy: 8.1, sector: "Mineração" },
  { assetId: "3", ticker: "WEGE3", name: "WEG", favorite: false, pl: 32.0, dy: 1.4, sector: "Industrial" },
  { assetId: "4", ticker: "XPTO3", name: "Sem Dados", favorite: false, pl: null, dy: null, sector: null },
];

describe("applyFilters", () => {
  it("filtra por range min/max", () => {
    const result = applyFilters(rows, { pl: { min: 4, max: 10 } });
    expect(result.map((r) => r.ticker)).toEqual(["PETR4", "VALE3"]);
  });

  it("exclui valores nulos quando range ativo", () => {
    const result = applyFilters(rows, { dy: { min: 0 } });
    expect(result.find((r) => r.ticker === "XPTO3")).toBeUndefined();
  });

  it("filtra por select/texto", () => {
    const result = applyFilters(rows, { sector: { value: "petró" } });
    expect(result.map((r) => r.ticker)).toEqual(["PETR4"]);
  });

  it("sem filtros ativos retorna tudo", () => {
    expect(applyFilters(rows, { pl: {} })).toHaveLength(4);
  });
});

describe("applySearch", () => {
  it("busca por ticker e nome, case-insensitive", () => {
    expect(applySearch(rows, "vale")).toHaveLength(1);
    expect(applySearch(rows, "WEG")).toHaveLength(1);
    expect(applySearch(rows, "")).toHaveLength(4);
  });
});

describe("sortRows", () => {
  it("ordena números asc/desc com nulos por último", () => {
    const asc = sortRows(rows, "pl", "asc").map((r) => r.ticker);
    expect(asc).toEqual(["PETR4", "VALE3", "WEGE3", "XPTO3"]);

    const desc = sortRows(rows, "pl", "desc").map((r) => r.ticker);
    expect(desc).toEqual(["WEGE3", "VALE3", "PETR4", "XPTO3"]);
  });

  it("ordena strings alfabeticamente", () => {
    const sorted = sortRows(rows, "ticker", "asc").map((r) => r.ticker);
    expect(sorted).toEqual(["PETR4", "VALE3", "WEGE3", "XPTO3"]);
  });
});

describe("buildCsv", () => {
  it("gera CSV com ; e vírgula decimal", () => {
    const csv = buildCsv(
      [{ ticker: "PETR4", pl: 4.2 }],
      [
        { key: "ticker", label: "Ticker" },
        { key: "pl", label: "P/L" },
      ],
    );
    expect(csv).toContain("Ticker;P/L");
    expect(csv).toContain("PETR4;4,2");
  });

  it("escapa aspas e ponto-e-vírgula", () => {
    const csv = buildCsv(
      [{ name: 'Empresa "X"; S.A.' }],
      [{ key: "name", label: "Nome" }],
    );
    expect(csv).toContain('"Empresa ""X""; S.A."');
  });
});

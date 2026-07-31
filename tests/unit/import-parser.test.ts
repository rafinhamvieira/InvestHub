import { describe, expect, it } from "vitest";
import { parseCsv, mapRowsToTransactions } from "@/utils/import-parser";

describe("parseCsv", () => {
  it("detecta separador ; e faz parse básico", () => {
    const rows = parseCsv("a;b;c\n1;2;3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("suporta separador vírgula", () => {
    const rows = parseCsv("a,b\n1,2");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("respeita aspas com separador e aspas duplas internas", () => {
    const rows = parseCsv('nome;obs\nPETR4;"compra; parcial ""teste"""');
    expect(rows[1]).toEqual(["PETR4", 'compra; parcial "teste"']);
  });

  it("ignora linhas vazias e remove BOM", () => {
    const rows = parseCsv("﻿a;b\n1;2\n\n\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]![0]).toBe("a");
  });
});

describe("mapRowsToTransactions", () => {
  const header = ["ticker", "tipo_ativo", "operacao", "quantidade", "preco", "taxas", "data", "corretora", "observacoes"];

  it("converte linha válida com vírgula decimal e data brasileira", () => {
    const { parsed, errors } = mapRowsToTransactions([
      header,
      ["petr4", "acao", "compra", "100", "32,50", "4,90", "15/01/2025", "XP", "ok"],
    ]);
    expect(errors).toHaveLength(0);
    expect(parsed).toHaveLength(1);
    const row = parsed[0]!;
    expect(row.ticker).toBe("PETR4");
    expect(row.type).toBe("BUY");
    expect(row.assetType).toBe("STOCK");
    expect(row.price).toBeCloseTo(32.5);
    expect(row.fees).toBeCloseTo(4.9);
    expect(row.date.getFullYear()).toBe(2025);
    expect(row.date.getMonth()).toBe(0);
  });

  it("aceita cabeçalhos com acentos e sinônimos", () => {
    const { parsed, errors } = mapRowsToTransactions([
      ["Papel", "Categoria", "Operação", "Qtd", "Preço Unitário", "Data"],
      ["HGLG11", "FII", "Venda", "10", "160,00", "2025-03-10"],
    ]);
    expect(errors).toHaveLength(0);
    expect(parsed[0]!.type).toBe("SELL");
    expect(parsed[0]!.assetType).toBe("FII");
  });

  it("acumula erros por linha sem abortar as demais", () => {
    const { parsed, errors } = mapRowsToTransactions([
      header,
      ["XX", "acao", "compra", "100", "10", "0", "15/01/2025", "", ""],
      ["VALE3", "acao", "trocar", "100", "10", "0", "15/01/2025", "", ""],
      ["VALE3", "acao", "compra", "abc", "10", "0", "15/01/2025", "", ""],
      ["VALE3", "acao", "compra", "100", "10", "0", "40/01/2025", "", ""],
      ["VALE3", "acao", "compra", "100", "10", "0", "15/01/2025", "", ""],
    ]);
    expect(errors).toHaveLength(4);
    expect(parsed).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
  });

  it("falha cedo quando cabeçalho obrigatório falta", () => {
    const { parsed, errors } = mapRowsToTransactions([
      ["ticker", "quantidade"],
      ["PETR4", "100"],
    ]);
    expect(parsed).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("interpreta milhar brasileiro corretamente", () => {
    const { parsed } = mapRowsToTransactions([
      header,
      ["PETR4", "acao", "compra", "1.000", "1.234,56", "0", "15/01/2025", "", ""],
    ]);
    expect(parsed[0]!.quantity).toBe(1000);
    expect(parsed[0]!.price).toBeCloseTo(1234.56);
  });
});

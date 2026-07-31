import { describe, expect, it } from "vitest";
import { toUtcDateOnly, formatDateOnly, toDateInputValue, getUtcYear } from "@/utils/date";
import { transactionInputSchema } from "@/schemas/transaction.schema";
import { mapRowsToTransactions } from "@/utils/import-parser";

/**
 * Regressão: datas de operação eram gravadas à meia-noite UTC e exibidas no fuso local.
 * Em UTC-3 (Brasil), isso mostrava o dia anterior ao informado pelo usuário.
 */
describe("datas de calendário não deslocam por fuso", () => {
  it("formata o mesmo dia que foi informado", () => {
    expect(formatDateOnly("2025-01-15T00:00:00.000Z")).toBe("15/01/2025");
    expect(formatDateOnly("2025-12-31T00:00:00.000Z")).toBe("31/12/2025");
    expect(formatDateOnly("2025-01-01T00:00:00.000Z")).toBe("01/01/2025");
  });

  it("normaliza string yyyy-mm-dd para meia-noite UTC", () => {
    const date = toUtcDateOnly("2025-01-15");
    expect(date.toISOString()).toBe("2025-01-15T00:00:00.000Z");
  });

  it("ida e volta preserva o dia", () => {
    const original = "2025-03-09";
    const stored = toUtcDateOnly(original);
    expect(toDateInputValue(stored)).toBe(original);
    expect(formatDateOnly(stored)).toBe("09/03/2025");
  });

  it("extrai o ano em UTC", () => {
    // 01/01 à meia-noite UTC seria 2024 se lido em fuso negativo.
    expect(getUtcYear("2025-01-01T00:00:00.000Z")).toBe(2025);
  });

  it("lida com data inválida sem quebrar", () => {
    expect(formatDateOnly("não é data")).toBe("—");
  });
});

describe("schema de transação normaliza a data", () => {
  const base = {
    ticker: "PETR4",
    assetType: "STOCK" as const,
    type: "BUY" as const,
    quantity: 100,
    price: 32.5,
    fees: 0,
  };

  it("grava a data informada como meia-noite UTC", () => {
    const result = transactionInputSchema.safeParse({ ...base, date: "2025-01-15" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date.toISOString()).toBe("2025-01-15T00:00:00.000Z");
      expect(formatDateOnly(result.data.date)).toBe("15/01/2025");
    }
  });

  it("rejeita data no futuro", () => {
    const futuro = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(transactionInputSchema.safeParse({ ...base, date: futuro }).success).toBe(false);
  });
});

describe("importação preserva o dia informado", () => {
  it("converte dd/mm/aaaa sem deslocar", () => {
    const { parsed, errors } = mapRowsToTransactions([
      ["ticker", "operacao", "quantidade", "preco", "data"],
      ["PETR4", "compra", "100", "32,50", "15/01/2025"],
    ]);
    expect(errors).toHaveLength(0);
    expect(parsed[0]!.date.toISOString()).toBe("2025-01-15T00:00:00.000Z");
    expect(formatDateOnly(parsed[0]!.date)).toBe("15/01/2025");
  });
});

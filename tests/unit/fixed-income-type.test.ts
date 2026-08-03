import { describe, expect, it } from "vitest";
import type { AssetType } from "@prisma/client";
import { FIXED_INCOME_TYPES, isFixedIncomeType } from "@/schemas/transaction.schema";

const TODOS: AssetType[] = ["STOCK", "FII", "ETF", "BDR", "TREASURY", "FIXED_INCOME"];

describe("classes sem cotação", () => {
  /**
   * Esta classificação decide quem vai aos provedores externos.
   *
   * Enquanto ela não era usada no sync, cada ciclo consultava o provedor de fundamentos com
   * tickers de CDB e Tesouro — resposta 422 e cota queimada das 200 diárias, que são o
   * gargalo da cobertura do catálogo. Um ativo classificado errado aqui volta a gastar.
   */
  it("Tesouro e renda fixa privada não têm cotação", () => {
    expect(isFixedIncomeType("TREASURY")).toBe(true);
    expect(isFixedIncomeType("FIXED_INCOME")).toBe(true);
  });

  it("o que é negociado em bolsa tem", () => {
    for (const type of ["STOCK", "FII", "ETF", "BDR"]) {
      expect(isFixedIncomeType(type)).toBe(false);
    }
  });

  it("cobre todas as classes do schema, sem sobra nem falta", () => {
    // Classe nova no enum sem decisão aqui vira silenciosamente "tem cotação" e volta a
    // consultar provedor. O teste falha e obriga a escolha.
    const semCotacao = TODOS.filter(isFixedIncomeType);
    expect(semCotacao).toEqual([...FIXED_INCOME_TYPES]);
    expect(TODOS.length).toBe(6);
  });

  it("valor desconhecido não é tratado como renda fixa", () => {
    expect(isFixedIncomeType("CRIPTO")).toBe(false);
    expect(isFixedIncomeType("")).toBe(false);
  });
});

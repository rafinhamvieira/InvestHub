import { describe, expect, it } from "vitest";
import { isReservedName } from "@/validators/reserved-name.validator";

describe("isReservedName", () => {
  it("bloqueia termos diretos de administração", () => {
    for (const name of ["admin", "Administrador", "ADMINISTRAÇÃO", "root", "Administrator"]) {
      expect(isReservedName(name), name).toBe(true);
    }
  });

  it("bloqueia quando o termo aparece junto de outras palavras", () => {
    expect(isReservedName("Suporte InvestHub")).toBe(true);
    expect(isReservedName("Equipe de Atendimento")).toBe(true);
    expect(isReservedName("Rafael Admin")).toBe(true);
  });

  it("bloqueia variações com acento e leetspeak", () => {
    expect(isReservedName("adm1n")).toBe(true);
    expect(isReservedName("R00T")).toBe(true);
    expect(isReservedName("Administraçao")).toBe(true);
    expect(isReservedName("$uporte")).toBe(true);
  });

  it("bloqueia tentativas com separadores", () => {
    expect(isReservedName("a-d-m-i-n")).toBe(true);
    expect(isReservedName("A D M I N")).toBe(true);
    expect(isReservedName("adm_in")).toBe(true);
  });

  it("bloqueia o nome da marca", () => {
    expect(isReservedName("InvestHub")).toBe(true);
    expect(isReservedName("Invest Hub Oficial")).toBe(true);
  });

  it("permite nomes legítimos que apenas contêm as letras", () => {
    for (const name of [
      "Rafael Correa Vieira",
      "Rooney Silva",
      "Admilson Souza",
      "Mastercard Pereira",
      "Ana Paula Contatore",
      "José da Silva",
    ]) {
      expect(isReservedName(name), name).toBe(false);
    }
  });
});

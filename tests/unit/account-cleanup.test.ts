import { describe, expect, it } from "vitest";
import { isExpiredUnverified } from "@/services/account-cleanup.service";

const AGORA = new Date("2026-08-02T12:00:00.000Z");

function conta(overrides: Partial<{ emailVerified: Date | null; createdAt: Date; role: string }>) {
  return {
    emailVerified: null,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    role: "USER",
    ...overrides,
  };
}

describe("remoção de cadastro não confirmado", () => {
  it("remove quem passou do prazo sem confirmar", () => {
    expect(isExpiredUnverified(conta({}), AGORA)).toBe(true);
  });

  it("mantém quem ainda está dentro do prazo", () => {
    const recente = conta({ createdAt: new Date("2026-08-02T06:00:00.000Z") });
    expect(isExpiredUnverified(recente, AGORA)).toBe(false);
  });

  it("nunca remove conta com e-mail confirmado, por mais antiga que seja", () => {
    const antiga = conta({
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      emailVerified: new Date("2020-01-01T01:00:00.000Z"),
    });
    expect(isExpiredUnverified(antiga, AGORA)).toBe(false);
  });

  it("nunca remove administrador", () => {
    // Um administrador sem e-mail confirmado ainda é quem opera a plataforma: removê-lo
    // deixaria o painel sem dono.
    expect(isExpiredUnverified(conta({ role: "ADMIN" }), AGORA)).toBe(false);
  });

  it("respeita o prazo configurado", () => {
    const conta48h = conta({ createdAt: new Date("2026-07-31T12:00:00.000Z") });
    expect(isExpiredUnverified(conta48h, AGORA, 72)).toBe(false);
    expect(isExpiredUnverified(conta48h, AGORA, 24)).toBe(true);
  });

  it("é exato no limite do prazo", () => {
    const exatamente24h = conta({ createdAt: new Date("2026-08-01T12:00:00.000Z") });
    expect(isExpiredUnverified(exatamente24h, AGORA, 24)).toBe(true);

    const faltandoUmMinuto = conta({ createdAt: new Date("2026-08-01T12:01:00.000Z") });
    expect(isExpiredUnverified(faltandoUmMinuto, AGORA, 24)).toBe(false);
  });
});

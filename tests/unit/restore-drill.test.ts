import { describe, expect, it } from "vitest";
import {
  assertDrillDatabase,
  buildDrillDatabaseName,
  isDrillDatabaseName,
  withDatabase,
} from "@/utils/restore-drill";

const URL_BASE = "postgresql://investhub:senha@postgres:5432/investhub";

describe("nome do banco de ensaio", () => {
  it("carrega prefixo reservado e carimbo de tempo", () => {
    const nome = buildDrillDatabaseName(new Date("2026-08-03T12:45:00.000Z"), "a1b2c3");

    expect(nome).toBe("investhub_ensaio_20260803t124500_a1b2c3");
    expect(isDrillDatabaseName(nome)).toBe(true);
  });

  it("cabe no limite de identificador do Postgres", () => {
    expect(buildDrillDatabaseName().length).toBeLessThanOrEqual(63);
  });

  it("dois nomes seguidos não colidem", () => {
    const referencia = new Date("2026-08-03T12:45:00.000Z");
    expect(buildDrillDatabaseName(referencia)).not.toBe(buildDrillDatabaseName(referencia));
  });
});

describe("guarda do banco de ensaio", () => {
  /**
   * Esta é a última barreira antes de um `DROP DATABASE`. Se ela deixar passar um nome que
   * não foi gerado aqui, o ensaio — que existe para ser a operação segura — vira a mais
   * perigosa da plataforma.
   */
  it("recusa o banco da aplicação", () => {
    expect(isDrillDatabaseName("investhub")).toBe(false);
    expect(isDrillDatabaseName("postgres")).toBe(false);
    expect(isDrillDatabaseName("investhub_test")).toBe(false);
  });

  it("recusa nome com aspas, espaço ou ponto e vírgula", () => {
    // O identificador entra num comando SQL que não aceita parâmetro; o formato é a defesa.
    for (const malicioso of [
      'investhub_ensaio_x"; DROP DATABASE investhub; --',
      "investhub_ensaio_x investhub",
      "investhub_ensaio_x;",
      "investhub_ensaio_X",
      "prefixo_errado_investhub_ensaio_x",
    ]) {
      expect(isDrillDatabaseName(malicioso)).toBe(false);
    }
  });

  it("recusa nome longo demais para o Postgres", () => {
    expect(isDrillDatabaseName(`investhub_ensaio_${"a".repeat(80)}`)).toBe(false);
  });

  it("assert lança em nome que não é de ensaio", () => {
    expect(() => assertDrillDatabase("investhub")).toThrow(/não é um banco de ensaio/);
    expect(() => assertDrillDatabase(buildDrillDatabaseName())).not.toThrow();
  });
});

describe("troca de banco na URL", () => {
  it("preserva credenciais e host", () => {
    const nome = buildDrillDatabaseName(new Date("2026-08-03T12:45:00.000Z"), "abc123");

    expect(withDatabase(URL_BASE, nome)).toBe(
      "postgresql://investhub:senha@postgres:5432/investhub_ensaio_20260803t124500_abc123",
    );
  });

  it("preserva os parâmetros da query", () => {
    const nome = buildDrillDatabaseName(new Date("2026-08-03T12:45:00.000Z"), "abc123");

    expect(withDatabase(`${URL_BASE}?schema=public`, nome)).toContain("?schema=public");
  });

  it("não monta URL para banco que não seja de ensaio", () => {
    expect(() => withDatabase(URL_BASE, "investhub")).toThrow(/não é um banco de ensaio/);
  });
});

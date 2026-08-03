import { describe, expect, it } from "vitest";
import { matchesLogFilters, parseLogLine, rotatedName, scanOrder } from "@/utils/log-file";
import type { AppLogEntry } from "@/types/admin";

const LINHA = JSON.stringify({
  level: "error",
  message: "Falha ao enviar e-mail",
  timestamp: "2026-08-03T12:00:00.000Z",
  to: "alguem@exemplo.com",
  provider: "smtp",
});

describe("interpretação da linha de log", () => {
  it("separa nível, mensagem e horário do resto, que vira contexto", () => {
    const entrada = parseLogLine(LINHA, "arquivo:0");

    expect(entrada).toEqual({
      id: "arquivo:0",
      level: "error",
      message: "Falha ao enviar e-mail",
      timestamp: "2026-08-03T12:00:00.000Z",
      context: { to: "alguem@exemplo.com", provider: "smtp" },
    });
  });

  it("devolve nulo para linha partida, em vez de lançar", () => {
    // A varredura lê a partir de um deslocamento em bytes, que quase nunca cai numa
    // fronteira de linha — fragmento no começo do bloco é o caso comum, não a exceção.
    expect(parseLogLine('vel":"error","message":"Falha', "x:0")).toBeNull();
    expect(parseLogLine("", "x:0")).toBeNull();
    expect(parseLogLine("   ", "x:0")).toBeNull();
  });

  it("recusa JSON válido que não seja um evento de log", () => {
    expect(parseLogLine('{"foo":"bar"}', "x:0")).toBeNull();
    expect(parseLogLine('"apenas uma string"', "x:0")).toBeNull();
    expect(parseLogLine("null", "x:0")).toBeNull();
    expect(parseLogLine('{"level":"critico","message":"x","timestamp":"y"}', "x:0")).toBeNull();
  });

  it("aceita evento sem nenhum contexto", () => {
    const entrada = parseLogLine(
      '{"level":"info","message":"Backup gerado","timestamp":"2026-08-03T12:00:00.000Z"}',
      "x:0",
    );

    expect(entrada?.context).toEqual({});
  });
});

describe("filtros do log", () => {
  const base: AppLogEntry = {
    id: "x:0",
    level: "warn",
    message: "Sincronização falhou",
    timestamp: "2026-08-03T12:00:00.000Z",
    context: { ticker: "PETR4", tentativas: 3 },
  };

  it("sem filtro, tudo passa", () => {
    expect(matchesLogFilters(base, { page: 1, pageSize: 50 })).toBe(true);
  });

  it("filtra por nível", () => {
    expect(matchesLogFilters(base, { levels: ["warn"], page: 1, pageSize: 50 })).toBe(true);
    expect(matchesLogFilters(base, { levels: ["error"], page: 1, pageSize: 50 })).toBe(false);
    // Lista vazia é ausência de filtro, não "nenhum nível".
    expect(matchesLogFilters(base, { levels: [], page: 1, pageSize: 50 })).toBe(true);
  });

  it("a busca alcança o contexto, não só a mensagem", () => {
    // Metade do valor de um log está nos campos que vieram junto.
    expect(matchesLogFilters(base, { search: "PETR4", page: 1, pageSize: 50 })).toBe(true);
    expect(matchesLogFilters(base, { search: "petr4", page: 1, pageSize: 50 })).toBe(true);
    expect(matchesLogFilters(base, { search: "VALE3", page: 1, pageSize: 50 })).toBe(false);
  });

  it("filtra por período, inclusive nas pontas", () => {
    const dentro = { from: "2026-08-03T00:00:00.000Z", to: "2026-08-03T23:59:59.000Z" };
    expect(matchesLogFilters(base, { ...dentro, page: 1, pageSize: 50 })).toBe(true);

    expect(
      matchesLogFilters(base, { from: "2026-08-04T00:00:00.000Z", page: 1, pageSize: 50 }),
    ).toBe(false);
    expect(matchesLogFilters(base, { to: "2026-08-02T00:00:00.000Z", page: 1, pageSize: 50 })).toBe(
      false,
    );
  });

  it("combina nível e busca", () => {
    const filtros = { levels: ["warn" as const], search: "PETR4", page: 1, pageSize: 50 };
    expect(matchesLogFilters(base, filtros)).toBe(true);
    expect(matchesLogFilters({ ...base, level: "info" }, filtros)).toBe(false);
  });
});

describe("rotação", () => {
  it("insere o índice antes da extensão", () => {
    expect(rotatedName("investhub.jsonl", 1)).toBe("investhub.1.jsonl");
    expect(rotatedName("investhub.jsonl", 12)).toBe("investhub.12.jsonl");
  });

  it("lida com nome sem extensão", () => {
    expect(rotatedName("investhub", 2)).toBe("investhub.2");
  });

  it("varre do arquivo atual para o mais antigo", () => {
    expect(scanOrder("investhub.jsonl", 3)).toEqual([
      "investhub.jsonl",
      "investhub.1.jsonl",
      "investhub.2.jsonl",
      "investhub.3.jsonl",
    ]);
  });
});

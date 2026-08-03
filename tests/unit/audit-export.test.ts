import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { toCsv, toExcel } from "@/utils/audit-export";
import type { AuditEntry } from "@/types/audit";

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "a1",
    seq: "42",
    action: "LOGIN_SUCCESS",
    label: "Login realizado",
    category: "LOGIN",
    result: "SUCCESS",
    targetName: "Rafael",
    targetEmail: "rafael@exemplo.com",
    actorName: null,
    actorEmail: "rafael@exemplo.com",
    selfService: true,
    sessionId: "sess-1",
    reason: null,
    notes: null,
    description: "Login realizado",
    ipAddress: "203.0.113.9",
    userAgent: "Mozilla/5.0",
    createdAt: "2026-08-02T13:45:00.000Z",
    ...overrides,
  };
}

describe("exportação CSV", () => {
  it("traz cabeçalho, BOM e uma linha por evento", () => {
    const csv = toCsv([entry(), entry({ id: "a2", seq: "43" })]);
    const linhas = csv.split("\r\n");

    expect(csv.startsWith("﻿")).toBe(true);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain("Sequência");
    expect(linhas[1]).toContain("rafael@exemplo.com");
  });

  it("neutraliza separador vindo do dado", () => {
    const csv = toCsv([entry({ reason: "Motivo; com ponto e vírgula" })]);
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("desarma fórmula de planilha", () => {
    // Célula começando com "=" é executada ao abrir no Excel.
    const csv = toCsv([entry({ targetEmail: "=HYPERLINK(\"http://malicioso\")" })]);
    expect(csv).toContain("'=HYPERLINK");
  });

  it("quebra de linha no dado não vira linha nova", () => {
    const csv = toCsv([entry({ notes: "linha um\nlinha dois" })]);
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});

describe("exportação Excel", () => {
  it("gera planilha legível com os eventos", async () => {
    const buffer = await toExcel([entry(), entry({ id: "a2", seq: "43", result: "FAILED" })]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Auditoria")!;

    expect(sheet).toBeDefined();
    // Cabeçalho + dois eventos.
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(1).getCell(1).value).toBe("Sequência");
    expect(sheet.getRow(2).getCell(6).value).toBe("rafael@exemplo.com");
    expect(sheet.getRow(3).getCell(5).value).toBe("Falha");
  });

  it("também desarma fórmula na planilha", async () => {
    const buffer = await toExcel([entry({ targetEmail: "@SUM(A1:A9)" })]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const value = workbook.getWorksheet("Auditoria")!.getRow(2).getCell(6).value;

    expect(String(value).startsWith("'")).toBe(true);
  });
});

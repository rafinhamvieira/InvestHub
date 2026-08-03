/**
 * Exportação da trilha de auditoria.
 *
 * Todo campo vindo do usuário é neutralizado antes de virar planilha: nome cadastrado como
 * `=CMD()` ou com ponto e vírgula quebraria o arquivo — ou, pior, viraria fórmula executável
 * ao abrir no Excel. É o mesmo cuidado que se toma com HTML, aplicado à planilha.
 */

import ExcelJS from "exceljs";
import { AUDIT_CATEGORIES } from "@/constants/audit";
import type { AuditEntry } from "@/types/audit";

const COLUMNS = [
  { header: "Sequência", key: "seq", width: 12 },
  { header: "Data/Hora (UTC)", key: "createdAt", width: 22 },
  { header: "Evento", key: "label", width: 34 },
  { header: "Categoria", key: "category", width: 16 },
  { header: "Resultado", key: "result", width: 12 },
  { header: "Usuário afetado", key: "target", width: 30 },
  { header: "Executado por", key: "actor", width: 30 },
  { header: "IP", key: "ip", width: 16 },
  { header: "Sessão", key: "session", width: 26 },
  { header: "Justificativa", key: "reason", width: 40 },
  { header: "Observações", key: "notes", width: 30 },
] as const;

/**
 * Neutraliza o que o Excel interpretaria como fórmula.
 * Uma célula começando com `=`, `+`, `-` ou `@` é executada ao abrir a planilha.
 */
function sanitize(value: string | null | undefined): string {
  if (!value) return "";
  const text = String(value).replace(/[\r\n]+/g, " ").trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function row(entry: AuditEntry) {
  return {
    seq: entry.seq,
    createdAt: entry.createdAt.replace("T", " ").slice(0, 19),
    label: sanitize(entry.label),
    category: AUDIT_CATEGORIES[entry.category],
    result: entry.result === "SUCCESS" ? "Sucesso" : "Falha",
    target: sanitize(entry.targetEmail),
    actor: sanitize(entry.actorEmail),
    ip: sanitize(entry.ipAddress),
    session: sanitize(entry.sessionId),
    reason: sanitize(entry.reason),
    notes: sanitize(entry.notes),
  };
}

/** CSV com ponto e vírgula: é o separador que o Excel em pt-BR espera. */
export function toCsv(entries: AuditEntry[]): string {
  const header = COLUMNS.map((column) => column.header).join(";");
  const lines = entries.map((entry) => {
    const data = row(entry);
    return COLUMNS.map((column) => String(data[column.key]).replace(/;/g, ",")).join(";");
  });

  // BOM para o Excel reconhecer UTF-8 e não estropiar os acentos.
  return `﻿${[header, ...lines].join("\r\n")}`;
}

export async function toExcel(entries: AuditEntry[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "InvestHub";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Auditoria", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF101F3C" },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const entry of entries) {
    const added = sheet.addRow(row(entry));
    if (entry.result === "FAILED") {
      added.getCell("result").font = { color: { argb: "FFB00020" }, bold: true };
    }
  }

  sheet.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Geração de CSV pura (client-safe). Separador ; e vírgula decimal para Excel pt-BR. */

interface CsvColumn {
  key: string;
  label: string;
}

export function buildCsv(
  rows: Array<Record<string, unknown>>,
  columns: CsvColumn[],
): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    let text = typeof value === "number" ? String(value).replace(".", ",") : String(value);
    if (/[";\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
    return text;
  };

  const header = columns.map((c) => escape(c.label)).join(";");
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(";"));
  return "﻿" + [header, ...lines].join("\n");
}

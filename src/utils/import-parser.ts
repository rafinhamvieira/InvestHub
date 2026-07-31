/**
 * Parser puro de importação de carteira (CSV → linhas de transação).
 * Aceita cabeçalhos flexíveis (acentos, maiúsculas, sinônimos) e vírgula decimal.
 */

export interface RawImportRow {
  /** Linha original no arquivo (1-based, contando o cabeçalho). */
  line: number;
  ticker: string;
  assetType: string;
  type: string;
  quantity: string;
  price: string;
  fees: string;
  date: string;
  brokerName: string;
  notes: string;
}

export interface ParsedImportRow {
  line: number;
  ticker: string;
  assetType: "STOCK" | "FII" | "ETF" | "BDR" | "TREASURY";
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  fees: number;
  date: Date;
  brokerName: string;
  notes: string;
}

export interface ImportParseError {
  line: number;
  message: string;
}

/** Parser CSV com suporte a aspas, separador ; ou , (auto-detectado) e BOM. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      current.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      current.push(field);
      field = "";
      if (current.some((f) => f.trim() !== "")) rows.push(current);
      current = [];
    } else {
      field += char;
    }
  }
  current.push(field);
  if (current.some((f) => f.trim() !== "")) rows.push(current);

  return rows;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_MAP: Record<string, keyof Omit<RawImportRow, "line">> = {
  ticker: "ticker",
  ativo: "ticker",
  codigo: "ticker",
  papel: "ticker",
  tipoativo: "assetType",
  classe: "assetType",
  categoria: "assetType",
  operacao: "type",
  tipo: "type",
  tipooperacao: "type",
  quantidade: "quantity",
  qtd: "quantity",
  qtde: "quantity",
  preco: "price",
  precounitario: "price",
  valorunitario: "price",
  taxas: "fees",
  custos: "fees",
  corretagem: "fees",
  data: "date",
  datanegociacao: "date",
  corretora: "brokerName",
  instituicao: "brokerName",
  observacoes: "notes",
  observacao: "notes",
  obs: "notes",
};

const ASSET_TYPE_MAP: Record<string, ParsedImportRow["assetType"]> = {
  acao: "STOCK", acoes: "STOCK", stock: "STOCK", ação: "STOCK",
  fii: "FII", fundoimobiliario: "FII",
  etf: "ETF",
  bdr: "BDR",
  tesouro: "TREASURY", treasury: "TREASURY", rendafixa: "TREASURY",
};

const OPERATION_MAP: Record<string, ParsedImportRow["type"]> = {
  compra: "BUY", buy: "BUY", c: "BUY",
  venda: "SELL", sell: "SELL", v: "SELL",
};

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/R\$\s?/, "");
  if (!text) return null;
  // "1.234,56" → 1234.56 · "1.000" (milhar BR sem decimais) → 1000 · "1234.56" → 1234.56
  let normalized: string;
  if (text.includes(",")) {
    normalized = text.replaceAll(".", "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replaceAll(".", "");
  } else {
    normalized = text;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseDate(raw: string): Date | null {
  const text = raw.trim();
  // Constrói em UTC (a data da operação é um dia do calendário, não um instante) e valida
  // os componentes explicitamente — o Date do JS "rola" dias inválidos (40/01 vira 09/02).
  const build = (year: number, month: number, day: number): Date | null => {
    const date = new Date(Date.UTC(year, month - 1, day));
    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    return valid ? date : null;
  };

  // dd/mm/yyyy
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return build(Number(brMatch[3]), Number(brMatch[2]), Number(brMatch[1]));

  // yyyy-mm-dd
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return build(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  return null;
}

export function mapRowsToTransactions(rows: string[][]): {
  parsed: ParsedImportRow[];
  errors: ImportParseError[];
} {
  const parsed: ParsedImportRow[] = [];
  const errors: ImportParseError[] = [];

  if (rows.length < 2) {
    errors.push({ line: 1, message: "Arquivo vazio ou sem linhas de dados." });
    return { parsed, errors };
  }

  const headers = rows[0]!.map(normalizeHeader);
  const columnIndex = new Map<keyof Omit<RawImportRow, "line">, number>();
  headers.forEach((header, index) => {
    const mapped = HEADER_MAP[header];
    if (mapped && !columnIndex.has(mapped)) columnIndex.set(mapped, index);
  });

  for (const required of ["ticker", "type", "quantity", "price", "date"] as const) {
    if (!columnIndex.has(required)) {
      errors.push({
        line: 1,
        message: `Coluna obrigatória ausente: ${required === "type" ? "operação (compra/venda)" : required}.`,
      });
    }
  }
  if (errors.length > 0) return { parsed, errors };

  const get = (row: string[], key: keyof Omit<RawImportRow, "line">): string => {
    const index = columnIndex.get(key);
    return index !== undefined ? (row[index] ?? "").trim() : "";
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const line = i + 1;

    const ticker = get(row, "ticker").toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(ticker)) {
      errors.push({ line, message: `Ticker inválido: "${get(row, "ticker")}".` });
      continue;
    }

    const operationKey = normalizeHeader(get(row, "type"));
    const type = OPERATION_MAP[operationKey];
    if (!type) {
      errors.push({ line, message: `Operação inválida: "${get(row, "type")}" (use compra/venda).` });
      continue;
    }

    const assetTypeKey = normalizeHeader(get(row, "assetType"));
    const assetType = ASSET_TYPE_MAP[assetTypeKey] ?? "STOCK";

    const quantity = parseNumber(get(row, "quantity"));
    if (quantity === null || quantity <= 0) {
      errors.push({ line, message: `Quantidade inválida: "${get(row, "quantity")}".` });
      continue;
    }

    const price = parseNumber(get(row, "price"));
    if (price === null || price < 0) {
      errors.push({ line, message: `Preço inválido: "${get(row, "price")}".` });
      continue;
    }

    const fees = parseNumber(get(row, "fees")) ?? 0;

    const date = parseDate(get(row, "date"));
    if (!date) {
      errors.push({ line, message: `Data inválida: "${get(row, "date")}" (use dd/mm/aaaa).` });
      continue;
    }
    if (date > new Date()) {
      errors.push({ line, message: "Data no futuro." });
      continue;
    }

    parsed.push({
      line,
      ticker,
      assetType,
      type,
      quantity,
      price,
      fees,
      date,
      brokerName: get(row, "brokerName"),
      notes: get(row, "notes"),
    });
  }

  return { parsed, errors };
}

export const IMPORT_TEMPLATE_CSV =
  "ticker;tipo_ativo;operacao;quantidade;preco;taxas;data;corretora;observacoes\n" +
  "PETR4;acao;compra;100;32,50;4,90;15/01/2025;XP;Primeira compra\n" +
  "HGLG11;fii;compra;50;160,00;0;20/02/2025;Rico;\n" +
  "PETR4;acao;venda;30;38,00;4,90;10/06/2025;XP;Realização parcial\n";

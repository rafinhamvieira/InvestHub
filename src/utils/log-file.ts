/**
 * Leitura do arquivo de log — puro, sem I/O.
 *
 * O log é gravado em JSON Lines: uma linha por evento, cada linha um objeto completo. O
 * formato foi escolhido por uma propriedade que importa aqui: **arquivo truncado ou linha
 * pela metade não invalida o resto**. Basta descartar a linha ruim e seguir, e é isso que a
 * interpretação abaixo faz — em vez de lançar e deixar o painel sem log justamente quando
 * alguma coisa está errada.
 */

import type { AppLogEntry, AppLogFilters, AppLogLevel } from "@/types/admin";

const LEVELS: AppLogLevel[] = ["debug", "info", "warn", "error"];

function isLevel(value: unknown): value is AppLogLevel {
  return typeof value === "string" && LEVELS.includes(value as AppLogLevel);
}

/**
 * Interpreta uma linha. Devolve `null` para lixo — linha vazia, JSON quebrado, objeto sem
 * os campos obrigatórios. Linha partida ao meio é esperada: a varredura lê o fim do arquivo
 * a partir de um deslocamento em bytes, que quase nunca cai numa fronteira de linha.
 */
export function parseLogLine(line: string, id: string): AppLogEntry | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const { level, message, timestamp, ...context } = parsed as Record<string, unknown>;

  if (!isLevel(level) || typeof message !== "string" || typeof timestamp !== "string") {
    return null;
  }

  return { id, level, message, timestamp, context };
}

/**
 * Filtro da tela.
 *
 * A busca cobre a mensagem **e** o contexto: metade do valor de um log está nos campos que
 * vieram junto — o ticker que falhou, o e-mail que não saiu, o código do erro. Procurar só
 * na mensagem devolveria "nada encontrado" para o que está bem ali.
 */
export function matchesLogFilters(entry: AppLogEntry, filters: AppLogFilters): boolean {
  if (filters.levels && filters.levels.length > 0 && !filters.levels.includes(entry.level)) {
    return false;
  }

  if (filters.from && entry.timestamp < filters.from) return false;
  if (filters.to && entry.timestamp > filters.to) return false;

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = `${entry.message} ${JSON.stringify(entry.context)}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

/**
 * Nome do arquivo rotacionado. `investhub.jsonl` vira `investhub.1.jsonl`, e assim por
 * diante — quanto maior o número, mais antigo.
 */
export function rotatedName(baseName: string, index: number): string {
  const dot = baseName.lastIndexOf(".");
  if (dot <= 0) return `${baseName}.${index}`;

  return `${baseName.slice(0, dot)}.${index}${baseName.slice(dot)}`;
}

/**
 * Ordem de varredura: o arquivo atual primeiro, depois os rotacionados do mais novo para o
 * mais antigo. É a ordem em que o painel precisa ler para mostrar o recente primeiro.
 */
export function scanOrder(baseName: string, keep: number): string[] {
  return [baseName, ...Array.from({ length: keep }, (_, index) => rotatedName(baseName, index + 1))];
}

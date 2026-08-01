/**
 * Regras de nome e caminho dos arquivos de backup — puro, sem I/O.
 *
 * Isolado porque é o ponto onde um erro custa caro: o nome do arquivo chega pela URL, e
 * download de arquivo por parâmetro é a porta clássica de *path traversal* — `..%2f..%2f`
 * até `/etc/passwd` ou até o `.env`. Duas defesas independentes:
 *
 *  1. o nome precisa casar com o padrão dos dumps, e nada mais;
 *  2. o caminho resolvido precisa continuar dentro da pasta de backups.
 *
 * A segunda existe porque a primeira depende de a expressão estar certa — e expressão
 * regular é justamente o tipo de coisa que envelhece mal.
 */

import path from "node:path";

/** `investhub-20260801-0300.sql.gz` e as variantes manuais com sufixo descritivo. */
const BACKUP_FILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}\.sql\.gz$/;

export function isValidBackupName(name: string): boolean {
  if (!BACKUP_FILE_PATTERN.test(name)) return false;
  // Barra, contrabarra e ".." nunca aparecem num nome legítimo — nem decodificados.
  return !name.includes("..") && !name.includes("/") && !name.includes("\\");
}

/**
 * Caminho absoluto do arquivo dentro da pasta de backups.
 * Devolve `null` quando o nome é inválido ou quando o caminho escaparia da pasta.
 */
export function resolveBackupPath(directory: string, name: string): string | null {
  if (!isValidBackupName(name)) return null;

  const base = path.resolve(directory);
  const target = path.resolve(base, name);

  // `path.resolve` já normaliza "..": se o resultado saiu da base, o nome era malicioso.
  const inside = target === base ? false : target.startsWith(base + path.sep);
  return inside ? target : null;
}

/** Nome do dump gerado sob demanda, com carimbo de tempo em UTC. */
export function buildBackupName(reference = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp =
    `${reference.getUTCFullYear()}${pad(reference.getUTCMonth() + 1)}${pad(reference.getUTCDate())}` +
    `-${pad(reference.getUTCHours())}${pad(reference.getUTCMinutes())}${pad(reference.getUTCSeconds())}`;

  return `investhub-manual-${stamp}.sql.gz`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

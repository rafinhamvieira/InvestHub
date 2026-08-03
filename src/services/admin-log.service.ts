/**
 * Leitura do log da aplicação para o painel.
 *
 * O arquivo é acrescido no fim, então o que interessa está no fim — e ler tudo para mostrar
 * as últimas cem linhas seria desperdício crescente. A varredura lê **do fim para trás**,
 * em blocos, com teto de bytes: o painel responde no mesmo tempo com um arquivo de 8 MB ou
 * de 8 kB, e diz quando parou antes do começo em vez de fingir que aquilo era tudo.
 *
 * Ler a partir de um deslocamento em bytes quase nunca cai numa fronteira de linha; a
 * primeira linha do bloco costuma vir partida. `parseLogLine` devolve `null` para ela e a
 * varredura segue — perder um evento na borda é melhor que quebrar a tela.
 */

import { open, stat } from "node:fs/promises";
import path from "node:path";
import { logLocation } from "@/lib/log-sink";
import { matchesLogFilters, parseLogLine, scanOrder } from "@/utils/log-file";
import type { AppLogEntry, AppLogFilters, AppLogPage } from "@/types/admin";

/** Teto de leitura por consulta. Acima disto o painel se declara truncado. */
const SCAN_BUDGET_BYTES = Number(process.env.LOG_SCAN_BYTES ?? 4 * 1024 * 1024);
/** Bloco de leitura. Grande o bastante para poucas idas ao disco. */
const CHUNK_BYTES = 256 * 1024;

/** Lê um arquivo do fim para o começo, entregando as linhas já na ordem do mais recente. */
async function readBackwards(
  filePath: string,
  budget: number,
  onLine: (line: string, offset: number) => void,
): Promise<number> {
  const info = await stat(filePath);
  let position = info.size;
  let consumed = 0;
  let pending = "";

  const handle = await open(filePath, "r");

  try {
    while (position > 0 && consumed < budget) {
      const size = Math.min(CHUNK_BYTES, position, budget - consumed);
      position -= size;
      consumed += size;

      const buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, position);

      const lines = (buffer.toString("utf8") + pending).split("\n");
      // A primeira linha do bloco continua no bloco anterior; ela espera a próxima volta.
      pending = lines.shift() ?? "";

      for (let index = lines.length - 1; index >= 0; index--) {
        onLine(lines[index]!, position + index);
      }
    }

    // Só entrega a linha pendente se a varredura chegou ao início do arquivo — aí ela está
    // completa. Se parou pelo teto, é um fragmento e vai fora.
    if (position === 0 && pending.length > 0) onLine(pending, 0);
  } finally {
    await handle.close();
  }

  return consumed;
}

export const adminLogService = {
  /**
   * Página do log, do mais recente para o mais antigo.
   *
   * `total` conta o que casou dentro da janela varrida, não no histórico inteiro: com teto
   * de bytes não há como saber o total real sem ler tudo, e mentir um número redondo seria
   * pior que declarar o truncamento.
   */
  async list(filters: AppLogFilters): Promise<AppLogPage> {
    const files = scanOrder(logLocation.fileName, logLocation.keep);
    const matched: AppLogEntry[] = [];

    let budget = SCAN_BUDGET_BYTES;
    let truncated = false;
    let sizeBytes: number | null = null;

    for (const fileName of files) {
      if (budget <= 0) {
        truncated = true;
        break;
      }

      const filePath = path.join(logLocation.directory, fileName);

      try {
        const info = await stat(filePath);
        // O tamanho relatado é o do arquivo corrente, que é o primeiro da ordem.
        sizeBytes ??= info.size;
        if (info.size > budget) truncated = true;
      } catch {
        // Arquivo ausente é normal: rotação que ainda não aconteceu, ou sink desligado.
        continue;
      }

      const used = await readBackwards(filePath, budget, (line, offset) => {
        const entry = parseLogLine(line, `${fileName}:${offset}`);
        if (entry && matchesLogFilters(entry, filters)) matched.push(entry);
      }).catch(() => 0);

      budget -= used;
    }

    const start = (filters.page - 1) * filters.pageSize;

    return {
      entries: matched.slice(start, start + filters.pageSize),
      total: matched.length,
      truncated,
      page: filters.page,
      pageSize: filters.pageSize,
      sizeBytes,
    };
  },
};

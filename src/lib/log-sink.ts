/**
 * Gravação do log em arquivo, em JSON Lines.
 *
 * O `stdout` continua saindo sempre — `docker compose logs` não perde nada, e uma falha
 * aqui não cega ninguém. O arquivo existe para o log **sobreviver** ao container: hoje ele
 * some a cada `docker compose up -d --build`, que é justamente quando alguém vai querer
 * saber o que aconteceu antes.
 *
 * Três regras que este módulo não pode quebrar:
 *
 *  1. **nunca lançar.** Um erro ao gravar log não pode derrubar a operação que o gerou;
 *  2. **nunca chamar o `logger`.** Falha no sink registrada pelo logger que usa o sink é
 *     recursão infinita. O relato de falha aqui vai direto ao `console`, uma vez só;
 *  3. **nunca bloquear.** As escritas entram numa fila serializada e o chamador segue.
 *
 * A fila também garante que duas linhas não se intercalem no meio e que a rotação não
 * aconteça com uma escrita pela metade.
 */

import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { rotatedName } from "@/utils/log-file";

const LOG_DIR = process.env.LOG_DIR ?? "/logs";
const LOG_FILE = process.env.LOG_FILE ?? "investhub.jsonl";
/** Acima disto o arquivo rotaciona. 8 MB dão semanas no volume atual. */
const MAX_BYTES = Number(process.env.LOG_MAX_BYTES ?? 8 * 1024 * 1024);
/** Quantos arquivos rotacionados ficam. Os mais antigos são apagados. */
const KEEP = Number(process.env.LOG_KEEP ?? 5);

const filePath = path.join(LOG_DIR, LOG_FILE);

/** Fila de escrita. Cada tarefa engole o próprio erro para não parar a corrente. */
let queue: Promise<void> = Promise.resolve();
/** Tamanho corrente, em memória: evita um `stat` por linha. */
let bytesWritten: number | null = null;
/** Desligado após a primeira falha — pasta ausente ou sem permissão não melhora sozinha. */
let disabled = false;

function giveUp(reason: string, error: unknown): void {
  disabled = true;
  // Direto no console, e não pelo logger: ver a regra 2 no topo.
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: "error",
      message: `Log em arquivo desligado: ${reason}`,
      timestamp: new Date().toISOString(),
      path: filePath,
      error: (error as Error)?.message,
    }),
  );
}

async function rotate(): Promise<void> {
  // Do mais antigo para o mais novo, para nenhum passo sobrescrever o seguinte.
  await unlink(path.join(LOG_DIR, rotatedName(LOG_FILE, KEEP))).catch(() => null);

  for (let index = KEEP - 1; index >= 1; index--) {
    await rename(
      path.join(LOG_DIR, rotatedName(LOG_FILE, index)),
      path.join(LOG_DIR, rotatedName(LOG_FILE, index + 1)),
    ).catch(() => null);
  }

  await rename(filePath, path.join(LOG_DIR, rotatedName(LOG_FILE, 1)));
  bytesWritten = 0;
}

async function write(line: string): Promise<void> {
  if (bytesWritten === null) {
    await mkdir(LOG_DIR, { recursive: true });
    bytesWritten = await stat(filePath)
      .then((info) => info.size)
      .catch(() => 0);
  }

  await appendFile(filePath, line);
  bytesWritten += Buffer.byteLength(line);

  if (bytesWritten >= MAX_BYTES) await rotate();
}

/** Enfileira uma linha. Retorna imediatamente; a gravação acontece em segundo plano. */
export function appendLogLine(line: string): void {
  if (disabled || process.env.LOG_TO_FILE === "false") return;

  queue = queue.then(async () => {
    try {
      await write(`${line}\n`);
    } catch (error) {
      giveUp("não foi possível escrever no arquivo", error);
    }
  });
}

/** Onde o serviço de leitura procura os arquivos. */
export const logLocation = { directory: LOG_DIR, fileName: LOG_FILE, keep: KEEP };

/**
 * Log da aplicação.
 *
 * Sai sempre no `stdout`, que é o que o Docker recolhe, e — quando o sink de arquivo está
 * ativo — também numa linha do `investhub.jsonl`, para o registro sobreviver ao container e
 * o painel poder mostrá-lo. Os dois caminhos são independentes de propósito: falha na
 * gravação em arquivo não pode fazer o log sumir do `docker compose logs`.
 *
 * **Nunca coloque senha, token nem código de MFA no contexto.** Ele é gravado inteiro, e o
 * painel exibe o objeto como veio.
 */

import { appendLogLine } from "@/lib/log-sink";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const line = JSON.stringify(entry);

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);

  appendLogLine(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV !== "production") emit("debug", message, context);
  },
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};

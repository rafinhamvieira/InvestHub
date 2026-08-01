/**
 * Backups do banco pela interface administrativa.
 *
 * O dump é o dado mais sensível da plataforma: contém tudo de todos os usuários, inclusive
 * o que o painel se recusa a mostrar na tela. Por isso cada geração e cada download entram
 * na trilha de auditoria com autor, IP e horário, e a rota é limitada em cadência.
 *
 * A geração usa o `pg_dump` do container, apontando para o mesmo banco da aplicação. A
 * `DATABASE_URL` nunca é registrada em log: ela carrega a senha do Postgres.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { logger } from "@/lib/logger";
import { buildBackupName, resolveBackupPath } from "@/utils/backup-file";
import type { BackupFile } from "@/types/admin";

export class BackupError extends Error {
  constructor(
    public code: "NOT_FOUND" | "DUMP_FAILED" | "NOT_CONFIGURED",
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

/** Mesma pasta que o serviço `backup` do compose usa para os dumps automáticos. */
function backupDirectory(): string {
  return process.env.BACKUP_DIR ?? "/backups";
}

export const adminBackupService = {
  async list(): Promise<BackupFile[]> {
    const directory = backupDirectory();

    try {
      const names = await readdir(directory);
      const files = await Promise.all(
        names
          .filter((name) => name.endsWith(".sql.gz"))
          .map(async (name) => {
            const info = await stat(path.join(directory, name));
            return { name, sizeBytes: info.size, createdAt: info.mtime.toISOString() };
          }),
      );

      return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      // Pasta ausente é estado normal antes do primeiro backup, não erro.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  },

  /**
   * Gera um dump comprimido agora.
   *
   * Escreve num arquivo temporário e só renomeia no fim: dump interrompido no meio não vira
   * arquivo na lista, e ninguém baixa um backup pela metade acreditando estar protegido.
   */
  async create(): Promise<BackupFile> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new BackupError("NOT_CONFIGURED", "DATABASE_URL não configurada.");
    }

    const directory = backupDirectory();
    await mkdir(directory, { recursive: true });

    const name = buildBackupName();
    const finalPath = path.join(directory, name);
    const tempPath = `${finalPath}.part`;

    const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", databaseUrl], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    dump.stderr.on("data", (chunk: Buffer) => {
      // Limita o acúmulo: mensagem de erro do pg_dump é curta, mas o fluxo é ilimitado.
      if (stderr.length < 2000) stderr += chunk.toString();
    });

    try {
      await Promise.all([
        pipeline(dump.stdout, createGzip(), createWriteStream(tempPath)),
        new Promise<void>((resolve, reject) => {
          dump.on("error", reject);
          dump.on("close", (code) =>
            code === 0 ? resolve() : reject(new Error(`pg_dump saiu com código ${code}: ${stderr.trim()}`)),
          );
        }),
      ]);
    } catch (error) {
      await unlink(tempPath).catch(() => null);
      logger.error("Falha ao gerar backup", { error: (error as Error).message });
      throw new BackupError("DUMP_FAILED", "Não foi possível gerar o backup.");
    }

    await rename(tempPath, finalPath);
    const info = await stat(finalPath);

    logger.info("Backup gerado", { name, sizeBytes: info.size });
    return { name, sizeBytes: info.size, createdAt: info.mtime.toISOString() };
  },

  /** Caminho validado do arquivo para download. Nome inválido nunca vira caminho. */
  async resolveForDownload(name: string): Promise<{ path: string; sizeBytes: number }> {
    const target = resolveBackupPath(backupDirectory(), name);
    if (!target) throw new BackupError("NOT_FOUND", "Arquivo não encontrado.");

    try {
      const info = await stat(target);
      if (!info.isFile()) throw new BackupError("NOT_FOUND", "Arquivo não encontrado.");
      return { path: target, sizeBytes: info.size };
    } catch {
      throw new BackupError("NOT_FOUND", "Arquivo não encontrado.");
    }
  },
};

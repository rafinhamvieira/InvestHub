/**
 * Ensaio de restauração — a prova de que o backup serve.
 *
 * "Backup nunca restaurado não é backup": é um arquivo cuja utilidade ninguém verificou.
 * Este serviço carrega o dump num banco **temporário**, confere o conteúdo e apaga o banco.
 * A produção não é lida nem escrita em momento algum, fora das contagens de comparação.
 *
 * Por que não restaurar de verdade por aqui: o dump é SQL puro sem `--clean`, então carregar
 * por cima exigiria apagar o schema antes — com a aplicação destruindo o banco em que ela
 * própria roda, e sem volta caso falhe no meio. A restauração real é procedimento manual,
 * com a plataforma parada, documentado em `DEPLOY-CHECKLIST.md`.
 *
 * A verificação da cadeia de auditoria roda com o mesmo código da produção, apontado para o
 * banco temporário. Um backup que carrega a trilha mas perde o encadeamento seria backup de
 * um relatório, não de uma auditoria — e a diferença só aparece se alguém olhar.
 */

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { toLibpqUrl } from "@/utils/database-url";
import { assertDrillDatabase, buildDrillDatabaseName, withDatabase } from "@/utils/restore-drill";
import { auditIntegrityService } from "@/services/audit-integrity.service";
import { adminBackupService, BackupError } from "@/services/admin-backup.service";
import type { RestoreDrillReport, RestoreTableCount } from "@/types/admin";

/** Um ensaio por vez: dois em paralelo disputariam CPU e disco do mesmo Postgres. */
const LOCK_KEY = "admin:restore-drill";
const LOCK_SECONDS = 900;

/** Teto para o carregamento do dump. Passou disso, algo está errado, não lento. */
const RESTORE_TIMEOUT_MS = 10 * 60 * 1000;

export class RestoreDrillError extends Error {
  constructor(
    public code: "NOT_CONFIGURED" | "BUSY" | "RESTORE_FAILED" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "RestoreDrillError";
  }
}

/** Identificador não aceita parâmetro em SQL; o formato do nome é a defesa. Ver o util. */
async function createDatabase(name: string): Promise<void> {
  assertDrillDatabase(name);
  await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
}

async function dropDatabase(name: string): Promise<void> {
  assertDrillDatabase(name);
  // FORCE derruba conexões remanescentes — sem ele, um cliente pendurado impede a limpeza e
  // o banco de ensaio ficaria para trás ocupando disco.
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}

/** Carrega o dump no banco temporário. `ON_ERROR_STOP` transforma erro de SQL em falha. */
async function loadDump(filePath: string, url: string): Promise<void> {
  const psql = spawn(
    "psql",
    ["--quiet", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", toLibpqUrl(url)],
    { stdio: ["pipe", "ignore", "pipe"] },
  );

  let stderr = "";
  psql.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < 4000) stderr += chunk.toString();
  });

  const timer = setTimeout(() => psql.kill("SIGKILL"), RESTORE_TIMEOUT_MS);

  try {
    await Promise.all([
      pipeline(createReadStream(filePath), createGunzip(), psql.stdin),
      new Promise<void>((resolve, reject) => {
        psql.on("error", reject);
        psql.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`psql saiu com código ${code}: ${stderr.trim()}`)),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Contagens lado a lado.
 *
 * Diferença é esperada — o backup é de ontem, a produção é de agora. O que o laudo entrega é
 * a ordem de grandeza: `0` numa tabela que deveria ter milhares é o sinal que importa.
 */
async function compareTables(backup: PrismaClient): Promise<RestoreTableCount[]> {
  const tables = [
    { label: "Contas", count: (db: PrismaClient) => db.user.count() },
    { label: "Transações", count: (db: PrismaClient) => db.transaction.count() },
    { label: "Posições", count: (db: PrismaClient) => db.position.count() },
    { label: "Proventos recebidos", count: (db: PrismaClient) => db.dividendReceipt.count() },
    { label: "Títulos de renda fixa", count: (db: PrismaClient) => db.fixedIncomeTerms.count() },
    { label: "Ativos", count: (db: PrismaClient) => db.asset.count() },
    { label: "Registros de auditoria", count: (db: PrismaClient) => db.auditLog.count() },
  ];

  return Promise.all(
    tables.map(async (table) => ({
      label: table.label,
      backup: await table.count(backup),
      current: await table.count(prisma as unknown as PrismaClient),
    })),
  );
}

export const adminRestoreService = {
  /**
   * Restaura o arquivo num banco temporário, confere e apaga.
   *
   * O banco temporário é removido no `finally`: ensaio interrompido não pode deixar uma
   * cópia completa da base viva no servidor.
   */
  async drill(fileName: string): Promise<RestoreDrillReport> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new RestoreDrillError("NOT_CONFIGURED", "DATABASE_URL não configurada.");
    }

    const acquired = await redis
      .set(LOCK_KEY, "1", "EX", LOCK_SECONDS, "NX")
      .catch(() => "OK" as const);
    if (acquired === null) {
      throw new RestoreDrillError("BUSY", "Já existe um ensaio em andamento.");
    }

    const startedAt = Date.now();
    const database = buildDrillDatabaseName();
    let target: PrismaClient | null = null;

    try {
      const { path: filePath } = await adminBackupService.resolveForDownload(fileName);

      await createDatabase(database);
      await loadDump(filePath, withDatabase(databaseUrl, database));

      target = new PrismaClient({
        datasources: { db: { url: withDatabase(databaseUrl, database) } },
      });

      const [tables, newestAudit, integrity] = await Promise.all([
        compareTables(target),
        target.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { createdAt: true } }),
        auditIntegrityService.verify(target),
      ]);

      const warnings: string[] = [];
      const contas = tables.find((table) => table.label === "Contas");

      if (contas && contas.backup === 0) {
        warnings.push("O backup não tem nenhuma conta — provavelmente está vazio ou truncado.");
      }
      if (!integrity.valid) {
        warnings.push(
          "A cadeia de auditoria dentro do backup não confere. O arquivo serve para recuperar " +
            "dados, mas não prova mais a trilha.",
        );
      }
      if (integrity.unchainedRecords > 0) {
        warnings.push(
          `${integrity.unchainedRecords} registro(s) da trilha são anteriores à cadeia e ficaram fora da conferência.`,
        );
      }

      return {
        file: fileName,
        database,
        durationMs: Date.now() - startedAt,
        tables,
        newestAuditAt: newestAudit?.createdAt.toISOString() ?? null,
        auditChainValid: integrity.valid,
        auditRecords: integrity.totalRecords,
        lastValidCheckpointSeq: integrity.lastValidCheckpoint?.seq ?? null,
        warnings,
        verifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof BackupError) {
        throw new RestoreDrillError("NOT_FOUND", "Arquivo de backup não encontrado.");
      }

      logger.error("Ensaio de restauração falhou", {
        file: fileName,
        error: (error as Error).message,
      });
      throw new RestoreDrillError(
        "RESTORE_FAILED",
        "O backup não pôde ser carregado. O arquivo pode estar corrompido ou incompleto.",
      );
    } finally {
      await target?.$disconnect().catch(() => null);
      // A cópia temporária carrega os dados de todos os usuários; ela não sobrevive ao ensaio.
      await dropDatabase(database).catch((error: unknown) =>
        logger.error("Falha ao remover o banco de ensaio", {
          database,
          error: (error as Error).message,
        }),
      );
      await redis.del(LOCK_KEY).catch(() => null);
    }
  },
};

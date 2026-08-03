/**
 * Resumo de saúde da plataforma.
 *
 * Cinco verificações, cada uma respondendo a uma pergunta que já custou caro em produção:
 * o banco responde? o cache responde? os preços continuam chegando? existe backup recente?
 * as âncoras da auditoria estão sendo gravadas?
 *
 * Este serviço apenas **mede**. Quem decide o que é aceitável é `utils/health-status`, que
 * não toca em infraestrutura e por isso pode ser testado — a regra de negócio de um resumo
 * de saúde está nos limiares, não nas sondagens.
 *
 * Nenhuma sondagem lança: uma verificação quebrada vira `down` na sua própria linha, e as
 * outras quatro continuam aparecendo. Painel de saúde que fica em branco quando algo está
 * ruim é justamente o que não pode acontecer.
 *
 * **Limite conhecido:** não há CPU, memória do host nem disco. Ler isso exigiria montar o
 * socket do Docker dentro da aplicação, o que daria a ela controle do daemon — recusado.
 * O que sobra do processo (tempo no ar) vai no cabeçalho, sem fingir ser métrica de máquina.
 */

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { adminBackupService } from "@/services/admin-backup.service";
import { auditIntegrityService } from "@/services/audit-integrity.service";
import { syncHealthService } from "@/services/sync-health.service";
import { auditCheck, backupCheck, latencyCheck, syncCheck, worstStatus } from "@/utils/health-status";
import type { HealthCheck, HealthSummary } from "@/types/admin";

/** Acima disto o banco ainda responde, mas já não está saudável. */
const DATABASE_WARN_MS = 300;
/** O cache é local e existe para ser rápido; 100 ms já indica problema de rede ou memória. */
const CACHE_WARN_MS = 100;

/**
 * Prazo de cada sondagem.
 *
 * Sem ele, dependência caída não devolve erro — ela demora. O cliente do Postgres e o do
 * Redis reconectam antes de desistir, e a tela que existe para dizer "o banco caiu" ficaria
 * girando exatamente no momento em que alguém precisa dela.
 */
const PROBE_TIMEOUT_MS = 3000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Sem resposta em ${ms} ms.`)), ms);
  });

  // `race` já deixa um tratador na promessa perdedora: a rejeição tardia da sondagem não
  // vira unhandled rejection quando o prazo estoura primeiro.
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

async function timed(probe: () => Promise<unknown>): Promise<{ latencyMs: number; error?: string }> {
  const startedAt = Date.now();

  try {
    await withTimeout(probe(), PROBE_TIMEOUT_MS);
    return { latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { latencyMs: Date.now() - startedAt, error: (error as Error).message };
  }
}

/** Converte sondagem que falhou — ou que não respondeu a tempo — em linha `down`. */
async function safeCheck(
  key: string,
  label: string,
  build: () => Promise<HealthCheck>,
): Promise<HealthCheck> {
  try {
    return await withTimeout(build(), PROBE_TIMEOUT_MS);
  } catch (error) {
    logger.error("Falha ao apurar verificação de saúde", { key, error: (error as Error).message });
    return { key, label, status: "down", detail: "Não foi possível apurar esta verificação." };
  }
}

export const adminHealthService = {
  async summary(): Promise<HealthSummary> {
    const now = new Date();

    const checks = await Promise.all([
      safeCheck("database", "Banco de dados", async () =>
        latencyCheck(
          "database",
          "Banco de dados",
          await timed(() => prisma.$queryRaw`SELECT 1`),
          DATABASE_WARN_MS,
        ),
      ),

      safeCheck("cache", "Cache (Redis)", async () =>
        latencyCheck("cache", "Cache (Redis)", await timed(() => redis.ping()), CACHE_WARN_MS),
      ),

      safeCheck("sync", "Sincronização de mercado", async () =>
        syncCheck(await syncHealthService.snapshot(), now),
      ),

      safeCheck("backup", "Backup do banco", async () => {
        const files = await adminBackupService.list();
        // `list` já devolve do mais recente para o mais antigo.
        return backupCheck(files[0]?.createdAt ?? null, now);
      }),

      safeCheck("audit", "Âncoras da auditoria", async () =>
        auditCheck(await auditIntegrityService.anchorState()),
      ),
    ]);

    return {
      status: worstStatus(checks.map((check) => check.status)),
      checks,
      uptimeSeconds: Math.floor(process.uptime()),
      generatedAt: now.toISOString(),
    };
  },
};

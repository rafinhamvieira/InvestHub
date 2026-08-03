/**
 * Verificação da cadeia de auditoria.
 *
 * A cadeia é calculada dentro do banco (trigger `audit_logs_chain`): cada registro guarda o
 * hash do anterior, então alterar ou remover um evento antigo invalida todos os seguintes.
 * Esta verificação recomputa a cadeia inteira e aponta o primeiro ponto de divergência.
 *
 * Sozinha, a cadeia protege contra edição pontual, mas não contra quem tenha acesso de
 * escrita ao banco e recalcule tudo. Por isso os **checkpoints**: a aplicação assina o hash
 * de cabeça com uma chave que vive só no ambiente. Reescrever a história passaria a exigir
 * banco **e** chave — dois comprometimentos, não um.
 *
 * A chave ausente não impede a verificação da cadeia; apenas deixa as âncoras de fora, e o
 * relatório diz isso em vez de fingir garantia que não existe.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { auditCheckpointRepository } from "@/repositories/audit-checkpoint.repository";
import { logger } from "@/lib/logger";
import type { IntegrityReport } from "@/types/audit";

/** Registros lidos por vez ao percorrer a cadeia. */
const CHAIN_BATCH = 1000;
/** A cada quantos eventos uma nova âncora é gravada. */
const CHECKPOINT_EVERY = 500;

type ChainRow = Awaited<ReturnType<typeof auditLogRepository.chainSlice>>[number];

/**
 * Reproduz exatamente o payload que o trigger do banco monta.
 *
 * Qualquer divergência aqui — ordem dos campos, formato da data, tratamento de nulo — faria
 * a verificação acusar adulteração onde não houve. É o ponto mais frágil do mecanismo, e o
 * motivo de existir teste comparando com o resultado real do Postgres.
 */
export function chainPayload(row: ChainRow, prevHash: string | null): string {
  const timestamp = row.createdAt
    .toISOString()
    .replace("T", "T")
    .replace("Z", "")
    .slice(0, 23);

  return [
    row.seq.toString(),
    prevHash ?? "",
    row.action,
    row.result,
    row.userId ?? "",
    row.actorId ?? "",
    row.targetEmail ?? "",
    row.actorEmail ?? "",
    row.sessionId ?? "",
    row.entity ?? "",
    row.entityId ?? "",
    row.reason ?? "",
    row.ipAddress ?? "",
    row.metadata === null ? "" : JSON.stringify(row.metadata),
    timestamp,
  ].join("|");
}

export function computeHash(row: ChainRow, prevHash: string | null): string {
  return createHash("sha256").update(chainPayload(row, prevHash)).digest("hex");
}

function signCheckpoint(headHash: string): string | null {
  const key = process.env.AUDIT_HMAC_KEY;
  if (!key) return null;
  return createHmac("sha256", key).update(headHash).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const auditIntegrityService = {
  /**
   * Grava uma âncora se já houver eventos suficientes desde a última.
   * Chamado no ciclo de sincronização — não no caminho de cada evento, que ficaria mais lento.
   */
  async checkpointIfDue(): Promise<boolean> {
    const [head, last] = await Promise.all([
      auditLogRepository.head(),
      auditCheckpointRepository.last(),
    ]);

    if (!head?.hash) return false;

    const lastSeq = last?.seq ?? 0n;
    if (head.seq - lastSeq < BigInt(CHECKPOINT_EVERY)) return false;

    const hmac = signCheckpoint(head.hash);
    if (!hmac) {
      logger.warn("AUDIT_HMAC_KEY ausente — checkpoints da auditoria desativados");
      return false;
    }

    await auditCheckpointRepository.create({ seq: head.seq, headHash: head.hash, hmac });
    return true;
  },

  /**
   * Estado das âncoras para o resumo de saúde — duas leituras, sem percorrer a cadeia.
   *
   * A verificação completa (`verify`) lê a trilha inteira e é restrita ao super
   * administrador; o painel precisa apenas saber se as âncoras estão sendo gravadas, o que
   * cabe em duas consultas indexadas e não expõe conteúdo nenhum da trilha.
   */
  async anchorState(): Promise<{
    headSeq: bigint | null;
    checkpointSeq: bigint | null;
    signingConfigured: boolean;
    checkpointEvery: number;
  }> {
    const [head, last] = await Promise.all([
      auditLogRepository.head(),
      auditCheckpointRepository.last(),
    ]);

    return {
      headSeq: head?.seq ?? null,
      checkpointSeq: last?.seq ?? null,
      signingConfigured: Boolean(process.env.AUDIT_HMAC_KEY),
      checkpointEvery: CHECKPOINT_EVERY,
    };
  },

  /**
   * Percorre a cadeia inteira e devolve o laudo.
   *
   * Leitura pura: não corrige nada, não apaga nada. Se a trilha estiver quebrada, quem
   * decide o que fazer é uma pessoa.
   */
  async verify(): Promise<IntegrityReport> {
    const startedAt = Date.now();

    const [total, checkpoints] = await Promise.all([
      auditLogRepository.total(),
      auditCheckpointRepository.list(),
    ]);

    let lastValidCheckpoint: IntegrityReport["lastValidCheckpoint"] = null;
    for (const checkpoint of checkpoints) {
      const expected = signCheckpoint(checkpoint.headHash);
      if (expected && safeEquals(expected, checkpoint.hmac)) {
        lastValidCheckpoint = {
          seq: checkpoint.seq.toString(),
          createdAt: checkpoint.createdAt.toISOString(),
        };
      }
    }

    let cursor = 0n;
    let prevHash: string | null = null;
    let expectedSeq: bigint | null = null;
    const missingSequences: string[] = [];
    let firstInvalidRecord: IntegrityReport["firstInvalidRecord"] = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await auditLogRepository.chainSlice(cursor, CHAIN_BATCH);
      if (rows.length === 0) break;

      for (const row of rows) {
        if (expectedSeq !== null && row.seq !== expectedSeq && missingSequences.length < 50) {
          // Buraco na sequência: o `seq` é gerado por sequência do banco e nunca reutilizado,
          // então salto significa registro removido — mesmo que a cadeia siga coerente.
          for (let missing = expectedSeq; missing < row.seq; missing++) {
            missingSequences.push(missing.toString());
          }
        }
        expectedSeq = row.seq + 1n;

        if (!firstInvalidRecord) {
          const expectedHash = computeHash(row, prevHash);
          if (row.hash !== expectedHash) {
            firstInvalidRecord = {
              seq: row.seq.toString(),
              expectedHash,
              foundHash: row.hash,
              createdAt: row.createdAt.toISOString(),
            };
          }
        }

        prevHash = row.hash;
        cursor = row.seq;
      }
    }

    return {
      totalRecords: total,
      lastValidCheckpoint,
      firstInvalidRecord,
      missingSequences,
      verifiedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      valid: firstInvalidRecord === null && missingSequences.length === 0,
    };
  },
};

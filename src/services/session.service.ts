/**
 * Ciclo de vida das sessões.
 *
 * O Auth.js opera com JWT, que não guarda estado: sem este registro não há como listar
 * acessos, encerrar um deles nem correlacionar eventos de auditoria a um mesmo acesso.
 *
 * A verificação de validade roda em toda requisição administrativa, então passa por cache
 * curto no Redis — sem ele seriam duas consultas extras por página carregada.
 */

import { userSessionRepository } from "@/repositories/user-session.repository";
import { auditService } from "@/services/audit.service";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { parseUserAgent } from "@/utils/user-agent";
import { AUDIT_ACTIONS } from "@/constants/audit";
import type { SessionDTO } from "@/types/audit";
import type { SessionType } from "@prisma/client";

/** Cache da validade da sessão. Curto de propósito: revogação precisa surtir efeito rápido. */
const ACTIVE_CACHE_SECONDS = 60;
/** Intervalo mínimo entre atualizações de "última atividade". */
const TOUCH_INTERVAL_SECONDS = 300;

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function activeKey(id: string): string {
  return `session:active:${id}`;
}

function touchKey(id: string): string {
  return `session:touch:${id}`;
}

/**
 * Localização aproximada a partir do IP.
 *
 * Só consulta quando há provedor configurado — não quero embutir chamada a serviço externo
 * de terceiros no caminho do login por padrão, e IP de usuário é dado pessoal.
 */
async function resolveLocation(ip: string | null): Promise<string | null> {
  const provider = process.env.GEOIP_URL;
  if (!provider || !ip || ip === "unknown") return null;

  try {
    const response = await fetch(provider.replace("{ip}", ip), {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { city?: string; region?: string; country?: string };
    return [data.city, data.region ?? data.country].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

export const sessionService = {
  /** Cria a sessão no login e devolve o id que vai para o token. */
  async start(input: {
    userId: string;
    email: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    type?: SessionType;
    fingerprint?: string | null;
  }): Promise<string> {
    const { browser, os } = parseUserAgent(input.userAgent);
    const location = await resolveLocation(input.ipAddress ?? null);

    const session = await userSessionRepository.create({
      userId: input.userId,
      type: input.type,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      browser,
      os,
      location,
      fingerprint: input.fingerprint ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    });

    return session.id;
  },

  /**
   * A sessão continua valendo?
   *
   * `sessionsValidFrom` é a invalidação em bloco: qualquer sessão criada antes dela morre,
   * que é o que faz "forçar logout de todas as sessões" funcionar sem estado por token.
   */
  async isActive(sessionId: string, sessionsValidFrom?: Date | null): Promise<boolean> {
    try {
      const cached = await redis.get(activeKey(sessionId));
      if (cached === "0") return false;
      if (cached === "1" && !sessionsValidFrom) return true;
    } catch {
      // Cache fora do ar: segue para o banco.
    }

    const session = await userSessionRepository.findById(sessionId);
    const active =
      Boolean(session) &&
      session!.revokedAt === null &&
      session!.expiresAt > new Date() &&
      (!sessionsValidFrom || session!.createdAt >= sessionsValidFrom);

    await redis.set(activeKey(sessionId), active ? "1" : "0", "EX", ACTIVE_CACHE_SECONDS).catch(() => null);
    return active;
  },

  /** Marca atividade, no máximo uma vez a cada cinco minutos por sessão. */
  async touch(sessionId: string): Promise<void> {
    try {
      const recent = await redis.set(touchKey(sessionId), "1", "EX", TOUCH_INTERVAL_SECONDS, "NX");
      if (recent === null) return;
    } catch {
      // Sem cache, atualiza mesmo assim: perder "última atividade" é pior que uma escrita extra.
    }

    await userSessionRepository.touch(sessionId).catch((error) => {
      logger.warn("Falha ao atualizar última atividade da sessão", { error: String(error) });
    });
  },

  /** Encerra uma sessão. `SESSION_REVOKED` é crítico: sem log gravado, a operação falha. */
  async revoke(input: {
    sessionId: string;
    userId: string;
    userEmail: string;
    revokedBy: string | null;
    actorEmail: string | null;
    reason: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await userSessionRepository.revoke(input.sessionId, input.revokedBy, input.reason);
    await redis.set(activeKey(input.sessionId), "0", "EX", ACTIVE_CACHE_SECONDS).catch(() => null);

    await auditService.record({
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      userId: input.userId,
      targetEmail: input.userEmail,
      actorId: input.revokedBy,
      actorEmail: input.actorEmail,
      sessionId: input.sessionId,
      reason: input.reason,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  },

  async list(userId: string, currentSessionId: string | null): Promise<SessionDTO[]> {
    const sessions = await userSessionRepository.listByUser(userId);

    return sessions.map((session) => ({
      id: session.id,
      type: session.type,
      browser: session.browser,
      os: session.os,
      location: session.location,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      revocationReason: session.revocationReason,
      current: session.id === currentSessionId,
    }));
  },
};

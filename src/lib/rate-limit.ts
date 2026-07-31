import { redis } from "@/lib/redis";

interface RateLimitOptions {
  /** Identificador único do limite, ex: "login", "register" */
  key: string;
  /** Identificador do solicitante, ex: IP ou email */
  identifier: string;
  /** Máximo de tentativas na janela */
  max: number;
  /** Duração da janela em segundos */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Rate limit de janela fixa baseado em Redis (INCR + TTL).
 * Falha aberta (permite a requisição) se o Redis estiver indisponível,
 * para não derrubar autenticação por causa de infraestrutura de cache.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const { key, identifier, max, windowSeconds } = options;
  const redisKey = `ratelimit:${key}:${identifier}`;

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const ttl = await redis.ttl(redisKey);

    return {
      success: count <= max,
      remaining: Math.max(0, max - count),
      resetInSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  } catch {
    return { success: true, remaining: max, resetInSeconds: windowSeconds };
  }
}

export async function resetRateLimit(key: string, identifier: string): Promise<void> {
  try {
    await redis.del(`ratelimit:${key}:${identifier}`);
  } catch {
    // no-op: infraestrutura de cache indisponível não deve quebrar o fluxo principal
  }
}

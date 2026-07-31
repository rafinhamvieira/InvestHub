import { redis } from "@/lib/redis";

/**
 * Cache-aside com Redis. Falha aberta: se o Redis estiver indisponível,
 * executa o fetcher normalmente sem cachear.
 */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    // cache indisponível — segue para o fetcher
  }

  const value = await fetcher();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // não cacheou; sem impacto funcional
  }

  return value;
}

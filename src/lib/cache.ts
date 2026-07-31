import { redis } from "@/lib/redis";

/**
 * Cache-aside com Redis. Falha aberta: se o Redis estiver indisponível,
 * executa o fetcher normalmente sem cachear.
 */
interface CacheOptions<T> {
  /**
   * Decide se o valor deve ser guardado. Use para não cachear falhas: sem isso, uma
   * resposta vazia por erro da API ficaria "grudada" pelo TTL inteiro, e as chamadas
   * seguintes falhariam em silêncio, sem nem tentar a rede.
   */
  cacheIf?: (value: T) => boolean;
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  options?: CacheOptions<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    // cache indisponível — segue para o fetcher
  }

  const value = await fetcher();

  if (options?.cacheIf ? options.cacheIf(value) : true) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // não cacheou; sem impacto funcional
    }
  }

  return value;
}

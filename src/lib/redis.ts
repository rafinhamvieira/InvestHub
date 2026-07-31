import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export const redis =
  global.__redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    // Conecta só no primeiro comando — evita tentativa de conexão durante o build.
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") {
  global.__redis = redis;
}

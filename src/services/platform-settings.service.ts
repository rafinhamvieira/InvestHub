/**
 * Leitura e escrita dos parâmetros da plataforma.
 *
 * O valor efetivo é `linha no banco ?? padrão do registro`. Nunca há "valor faltando": uma
 * chave sem linha simplesmente usa o padrão, e é assim que apagar a linha desfaz a mudança.
 *
 * **Cache curto e falho aberto.** As leituras acontecem em caminhos frequentes — o vigia da
 * sincronização roda a cada healthcheck —, então o mapa inteiro fica no Redis por poucos
 * segundos. Redis fora do ar faz cada leitura ir ao banco: mais lento, nunca errado. E o
 * cache é apagado na escrita, para a mudança valer no próximo ciclo em vez de na próxima
 * expiração.
 */

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { auditService } from "@/services/audit.service";
import { AUDIT_ACTIONS } from "@/constants/audit";
import {
  PLATFORM_SETTINGS,
  PLATFORM_SETTING_KEYS,
  validateSetting,
  type PlatformSettingKey,
} from "@/config/platform-settings";

const CACHE_KEY = "platform:settings";
const CACHE_TTL_SECONDS = 15;

export class SettingError extends Error {
  constructor(
    public code: "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "SettingError";
  }
}

/** Autor da mudança, como as rotas administrativas já o montam. */
export interface SettingContext {
  adminId: string;
  adminEmail: string;
  sessionId?: string | null;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ResolvedSetting {
  key: PlatformSettingKey;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  value: number;
  fallback: number;
  /** Verdadeiro quando não há linha no banco: o valor vem do ambiente ou do código. */
  isDefault: boolean;
  updatedAt: string | null;
}

async function overrides(): Promise<Record<string, number>> {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Record<string, number>;
  } catch {
    // Cache indisponível — segue para o banco.
  }

  const rows = await prisma.platformSetting.findMany({ select: { key: true, value: true } });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  await redis.set(CACHE_KEY, JSON.stringify(map), "EX", CACHE_TTL_SECONDS).catch(() => null);
  return map;
}

export const platformSettingsService = {
  /** Valor efetivo de um parâmetro. Nunca lança: erro de leitura devolve o padrão. */
  async get(key: PlatformSettingKey): Promise<number> {
    try {
      const map = await overrides();
      return map[key] ?? PLATFORM_SETTINGS[key].fallback;
    } catch (error) {
      logger.warn("Falha ao ler parâmetro da plataforma; usando o padrão", {
        key,
        error: (error as Error).message,
      });
      return PLATFORM_SETTINGS[key].fallback;
    }
  },

  /** Todos os parâmetros com valor efetivo e origem, para a tela. */
  async all(): Promise<ResolvedSetting[]> {
    const [map, rows] = await Promise.all([
      overrides(),
      prisma.platformSetting.findMany({ select: { key: true, updatedAt: true } }),
    ]);

    const updatedAt = new Map(rows.map((row) => [row.key, row.updatedAt]));

    return PLATFORM_SETTING_KEYS.map((key) => {
      const spec = PLATFORM_SETTINGS[key];
      const override = map[key];

      return {
        ...spec,
        value: override ?? spec.fallback,
        isDefault: override === undefined,
        updatedAt: updatedAt.get(key)?.toISOString() ?? null,
      };
    });
  },

  /**
   * Grava um parâmetro.
   *
   * A validação contra os limites do registro acontece aqui, e não só na rota: é a última
   * barreira antes de um número que governa cota de API e janela de segurança.
   */
  async set(key: PlatformSettingKey, value: number, ctx: SettingContext): Promise<void> {
    const violation = validateSetting(key, value);
    if (violation) throw new SettingError("INVALID", violation.message);

    const previous = await this.get(key);

    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value, updatedBy: ctx.adminId },
      update: { value, updatedBy: ctx.adminId },
    });

    await redis.del(CACHE_KEY).catch(() => null);

    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_PLATFORM_SETTING_CHANGED,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
      entity: "PlatformSetting",
      entityId: key,
      metadata: { from: previous, to: value, label: PLATFORM_SETTINGS[key].label },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  /** Devolve o parâmetro ao padrão, apagando a linha. */
  async reset(key: PlatformSettingKey, ctx: SettingContext): Promise<void> {
    const previous = await this.get(key);

    await prisma.platformSetting.deleteMany({ where: { key } });
    await redis.del(CACHE_KEY).catch(() => null);

    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_PLATFORM_SETTING_CHANGED,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
      entity: "PlatformSetting",
      entityId: key,
      metadata: {
        from: previous,
        to: PLATFORM_SETTINGS[key].fallback,
        restoredDefault: true,
        label: PLATFORM_SETTINGS[key].label,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },
};

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireStepUp, authorizationStatus } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { platformSettingsService, SettingError } from "@/services/platform-settings.service";
import { PLATFORM_SETTING_KEYS } from "@/config/platform-settings";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SET"),
    key: z.enum(PLATFORM_SETTING_KEYS),
    value: z.number().int(),
    reason: z.string().trim().min(10).max(500),
  }),
  z.object({
    action: z.literal("RESET"),
    key: z.enum(PLATFORM_SETTING_KEYS),
    reason: z.string().trim().min(10).max(500),
  }),
]);

export async function GET() {
  try {
    await requirePermission(Permission.MANAGE_PLATFORM);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  return NextResponse.json({ settings: await platformSettingsService.all() });
}

/**
 * Altera um parâmetro.
 *
 * Exige `MANAGE_PLATFORM`, senha confirmada e justificativa. A permissão existia no mapa
 * desde a Etapa 1 sem nenhuma verificação — esta é a primeira. O step-up entra porque um
 * destes parâmetros é a validade do próprio step-up: sem ele, um token roubado poderia
 * esticar a janela e depois usá-la.
 */
export async function POST(request: Request) {
  let admin;
  try {
    admin = await requirePermission(Permission.MANAGE_PLATFORM);
    await requireStepUp(admin.id);
  } catch (error) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Confirme sua senha para continuar." },
      { status: authorizationStatus(error) },
    );
  }

  const rateLimit = await checkRateLimit({
    key: "admin-settings",
    identifier: admin.id,
    max: 20,
    windowSeconds: 300,
  });
  if (!rateLimit.success) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
  const ctx = {
    adminId: admin.id,
    adminEmail: admin.email,
    sessionId: admin.sessionId,
    reason: parsed.data.reason,
    ipAddress,
    userAgent,
  };

  try {
    if (parsed.data.action === "SET") {
      await platformSettingsService.set(parsed.data.key, parsed.data.value, ctx);
    } else {
      await platformSettingsService.reset(parsed.data.key, ctx);
    }

    return NextResponse.json({ settings: await platformSettingsService.all() });
  } catch (error) {
    if (error instanceof SettingError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }

    logger.error("Falha ao gravar parâmetro da plataforma", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

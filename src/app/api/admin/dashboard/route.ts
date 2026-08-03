import { NextResponse } from "next/server";
import { requirePermission, authorizationStatus } from "@/lib/auth-guard";
import { can, Permission } from "@/lib/permissions";
import { adminHealthService } from "@/services/admin-health.service";
import { adminMetricsService } from "@/services/admin-metrics.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { AdminDashboard } from "@/types/admin";

// A rota lê sessão e banco a cada chamada; nunca deve ser pré-renderizada no build.
export const dynamic = "force-dynamic";

/**
 * Painel administrativo — saúde para todo cargo administrativo, números de negócio só para
 * quem tem `VIEW_BUSINESS_METRICS`.
 *
 * As duas permissões são conferidas separadamente na mesma requisição: auditoria e suporte
 * precisam saber se a plataforma está de pé, sem enxergar patrimônio sob gestão. A tela
 * recebe `metrics: null` e simplesmente não desenha o bloco.
 */
export async function GET() {
  let admin;
  try {
    admin = await requirePermission(Permission.VIEW_SYSTEM_HEALTH);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  // A tela atualiza a saúde sozinha em intervalo curto; a cadência aqui existe para que uma
  // aba esquecida aberta — ou um token roubado — não vire varredura contínua de agregados.
  const rateLimit = await checkRateLimit({
    key: "admin-dashboard",
    identifier: admin.id,
    max: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.success) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  try {
    const [health, metrics] = await Promise.all([
      adminHealthService.summary(),
      can(admin, Permission.VIEW_BUSINESS_METRICS) ? adminMetricsService.summary() : null,
    ]);

    return NextResponse.json({ health, metrics } satisfies AdminDashboard);
  } catch (error) {
    logger.error("Falha ao montar o painel administrativo", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

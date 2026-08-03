import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireStepUp, authorizationStatus } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminRestoreService, RestoreDrillError } from "@/services/admin-restore.service";
import { auditService } from "@/services/audit.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS } from "@/constants/audit";

export const dynamic = "force-dynamic";
/** Carregar um dump grande leva minutos; o padrão do Next mataria a requisição antes. */
export const maxDuration = 600;

const bodySchema = z.object({
  file: z.string().min(1).max(160),
  reason: z.string().trim().min(10, "Descreva o motivo com pelo menos 10 caracteres.").max(500),
});

/**
 * Ensaio de restauração: carrega o backup num banco temporário, confere e apaga.
 *
 * A produção não é tocada — e mesmo assim a rota exige `RESTORE_BACKUP` (só SUPER_ADMIN),
 * senha confirmada e justificativa escrita. O motivo é o que a operação cria enquanto dura:
 * uma cópia completa dos dados de todos os usuários, viva no servidor por alguns minutos.
 */
export async function POST(request: Request) {
  let admin;
  try {
    admin = await requirePermission(Permission.RESTORE_BACKUP);
    await requireStepUp(admin.id);
  } catch (error) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Confirme sua senha para continuar." },
      { status: authorizationStatus(error) },
    );
  }

  // Cadência baixa: cada ensaio ocupa CPU e disco do mesmo Postgres que serve a aplicação.
  const rateLimit = await checkRateLimit({
    key: "admin-restore-drill",
    identifier: admin.id,
    max: 3,
    windowSeconds: 3600,
  });
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Muitos ensaios seguidos. Tente daqui a pouco." },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

  try {
    const report = await adminRestoreService.drill(parsed.data.file);

    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_BACKUP_DRILL,
      result: report.auditChainValid ? "SUCCESS" : "FAILED",
      actorId: admin.id,
      actorEmail: admin.email,
      sessionId: admin.sessionId,
      reason: parsed.data.reason,
      entity: "Backup",
      entityId: parsed.data.file,
      metadata: {
        durationMs: report.durationMs,
        auditChainValid: report.auditChainValid,
        warnings: report.warnings.length,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof RestoreDrillError) {
      await auditService
        .record({
          action: AUDIT_ACTIONS.ADMIN_BACKUP_DRILL,
          result: "FAILED",
          actorId: admin.id,
          actorEmail: admin.email,
          sessionId: admin.sessionId,
          reason: parsed.data.reason,
          entity: "Backup",
          entityId: parsed.data.file,
          metadata: { code: error.code },
          ipAddress,
          userAgent,
        })
        .catch(() => null);

      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "NOT_FOUND" ? 404 : error.code === "BUSY" ? 409 : 500 },
      );
    }

    logger.error("Falha inesperada no ensaio de restauração", {
      error: (error as Error).message,
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

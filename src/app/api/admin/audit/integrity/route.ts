import { NextResponse } from "next/server";
import { requirePermission, authorizationStatus } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { auditIntegrityService } from "@/services/audit-integrity.service";
import { auditService } from "@/services/audit.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { AUDIT_ACTIONS } from "@/constants/audit";
import { logger } from "@/lib/logger";

/** Percorrer a cadeia inteira leva tempo proporcional ao histórico. */
export const maxDuration = 120;

/**
 * Verificação da cadeia de auditoria — **somente leitura**.
 *
 * Não corrige nem apaga nada: devolve o laudo e deixa a decisão com uma pessoa. Restrita a
 * `VERIFY_AUDIT_INTEGRITY`, permissão que só o super administrador tem — quem atesta a
 * trilha não pode ser quem opera o dia a dia dela.
 *
 * A própria verificação é auditada: perguntar pela integridade também é evento.
 */
export async function GET() {
  let admin;
  try {
    admin = await requirePermission(Permission.VERIFY_AUDIT_INTEGRITY);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  const rateLimit = await checkRateLimit({
    key: "admin-audit-integrity",
    identifier: admin.id,
    max: 5,
    windowSeconds: 600,
  });
  if (!rateLimit.success) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  try {
    const report = await auditIntegrityService.verify();

    const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
    await auditService.record({
      action: AUDIT_ACTIONS.AUDIT_INTEGRITY_VERIFIED,
      result: report.valid ? "SUCCESS" : "FAILED",
      actorId: admin.id,
      actorEmail: admin.email,
      sessionId: admin.sessionId,
      metadata: {
        totalRecords: report.totalRecords,
        valid: report.valid,
        firstInvalidSeq: report.firstInvalidRecord?.seq ?? null,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(report);
  } catch (error) {
    logger.error("Falha ao verificar integridade da auditoria", {
      error: (error as Error).message,
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

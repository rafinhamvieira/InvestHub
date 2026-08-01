import { NextResponse } from "next/server";
import { requireAdmin, AdminAccessError } from "@/lib/admin-guard";
import { adminBackupService, BackupError } from "@/services/admin-backup.service";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { AUDIT_ACTIONS } from "@/constants/audit";
import { logger } from "@/lib/logger";

/** Dump grande demora; o padrão de 15s da plataforma não cobre. */
export const maxDuration = 300;

async function guard() {
  try {
    return await requireAdmin();
  } catch (error) {
    const status = error instanceof AdminAccessError && error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: "FORBIDDEN" }, { status });
  }
}

export async function GET() {
  const admin = await guard();
  if (admin instanceof NextResponse) return admin;

  try {
    return NextResponse.json({ files: await adminBackupService.list() });
  } catch (error) {
    logger.error("Falha ao listar backups", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST() {
  const admin = await guard();
  if (admin instanceof NextResponse) return admin;

  // Dump é caro em CPU e I/O: três por hora bastam para uso legítimo e impedem que alguém
  // use o botão como forma de derrubar o banco.
  const rateLimit = await checkRateLimit({
    key: "admin-backup-create",
    identifier: admin.id,
    max: 3,
    windowSeconds: 3600,
  });
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Limite de backups por hora atingido." },
      { status: 429 },
    );
  }

  try {
    const file = await adminBackupService.create();

    const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
    await auditLogRepository.record({
      userId: admin.id,
      action: AUDIT_ACTIONS.ADMIN_BACKUP_CREATED,
      entity: "Backup",
      entityId: file.name,
      metadata: { sizeBytes: file.sizeBytes },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(file);
  } catch (error) {
    if (error instanceof BackupError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    logger.error("Falha ao gerar backup", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

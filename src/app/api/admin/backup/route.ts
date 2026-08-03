import { NextResponse } from "next/server";
import { requirePermission, authorizationStatus } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminBackupService, BackupError } from "@/services/admin-backup.service";
import { auditService } from "@/services/audit.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { AUDIT_ACTIONS } from "@/constants/audit";
import { logger } from "@/lib/logger";

/** Dump grande demora; o padrão de 15s da plataforma não cobre. */
export const maxDuration = 300;

async function guard() {
  try {
    return await requirePermission(Permission.MANAGE_BACKUPS);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
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
    await auditService.record({
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

import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { requireAdmin, AdminAccessError } from "@/lib/admin-guard";
import { adminBackupService, BackupError } from "@/services/admin-backup.service";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { AUDIT_ACTIONS } from "@/constants/audit";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

/**
 * Download de um dump.
 *
 * O arquivo desce em fluxo, sem carregar na memória: um dump de centenas de MB derrubaria
 * o container se fosse lido inteiro antes de responder.
 *
 * Este é o endpoint mais sensível do sistema — quem baixa daqui leva os dados de todos os
 * usuários. Registrar quem baixou, quando e de qual IP não impede o download, mas garante
 * que ele nunca seja anônimo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    const status = error instanceof AdminAccessError && error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: "FORBIDDEN" }, { status });
  }

  const rateLimit = await checkRateLimit({
    key: "admin-backup-download",
    identifier: admin.id,
    max: 10,
    windowSeconds: 3600,
  });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const { file } = await params;
  const name = decodeURIComponent(file);

  try {
    const target = await adminBackupService.resolveForDownload(name);

    const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
    await auditLogRepository.record({
      userId: admin.id,
      action: AUDIT_ACTIONS.ADMIN_BACKUP_DOWNLOADED,
      entity: "Backup",
      entityId: name,
      metadata: { sizeBytes: target.sizeBytes },
      ipAddress,
      userAgent,
    });

    const stream = Readable.toWeb(createReadStream(target.path)) as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(target.sizeBytes),
        "Content-Disposition": `attachment; filename="${name}"`,
        // Backup nunca deve ficar em cache de navegador ou proxy.
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  } catch (error) {
    if (error instanceof BackupError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }
    logger.error("Falha ao baixar backup", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

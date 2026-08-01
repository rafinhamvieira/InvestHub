import { NextResponse } from "next/server";
import { z } from "zod";
import { createReadStream } from "node:fs";
import { createCipheriv } from "node:crypto";
import { Readable } from "node:stream";
import { requireAdmin, AdminAccessError } from "@/lib/admin-guard";
import { adminBackupService, BackupError } from "@/services/admin-backup.service";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { AUDIT_ACTIONS } from "@/constants/audit";
import {
  CIPHER_ALGORITHM,
  buildHeader,
  createIv,
  createSalt,
  deriveKey,
  encryptedName,
} from "@/utils/backup-crypto";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

const bodySchema = z.object({
  // Senha curta derrota o propósito: o arquivo é o dado mais sensível da plataforma.
  password: z.string().min(12, "Use pelo menos 12 caracteres.").max(200),
});

/**
 * Download de um dump, sempre cifrado.
 *
 * É POST, e não GET, porque a senha vai no corpo — em querystring ela apareceria no log do
 * nginx, no histórico do navegador e no cabeçalho `Referer`.
 *
 * O arquivo desce em fluxo, cifrado à medida que é lido: nem o dump nem a versão cifrada
 * são carregados inteiros na memória do servidor.
 *
 * Este é o endpoint mais sensível do sistema — quem baixa daqui leva os dados de todos os
 * usuários. Registrar quem baixou, quando e de qual IP não impede o download, mas garante
 * que ele nunca seja anônimo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ file: string }> }) {
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { file } = await params;
  const name = decodeURIComponent(file);

  try {
    const target = await adminBackupService.resolveForDownload(name);

    const salt = createSalt();
    const iv = createIv();
    const key = await deriveKey(parsed.data.password, salt);
    const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv);

    const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
    await auditLogRepository.record({
      userId: admin.id,
      action: AUDIT_ACTIONS.ADMIN_BACKUP_DOWNLOADED,
      entity: "Backup",
      entityId: name,
      metadata: { sizeBytes: target.sizeBytes, encrypted: true },
      ipAddress,
      userAgent,
    });

    // Cabeçalho em claro (só sal e IV), conteúdo cifrado, e a etiqueta de autenticidade no
    // fim — ela só existe depois que o último byte passou pela cifra.
    const source = createReadStream(target.path);
    const encrypted = new Readable({
      read() {},
    });

    encrypted.push(buildHeader(salt, iv));
    source.on("data", (chunk) => encrypted.push(cipher.update(chunk as Buffer)));
    source.on("end", () => {
      encrypted.push(cipher.final());
      encrypted.push(cipher.getAuthTag());
      encrypted.push(null);
    });
    source.on("error", (error) => encrypted.destroy(error));

    return new NextResponse(Readable.toWeb(encrypted) as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encryptedName(name)}"`,
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

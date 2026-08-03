import { NextResponse } from "next/server";
import { requirePermission, authorizationStatus } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { auditFiltersSchema } from "@/schemas/audit.schema";
import { auditService } from "@/services/audit.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  let admin;
  try {
    admin = await requirePermission(Permission.VIEW_AUDIT);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  // Leitura barata, mas exportável em massa: a cadência impede que um token roubado varra o
  // histórico inteiro em segundos.
  const rateLimit = await checkRateLimit({
    key: "admin-audit",
    identifier: admin.id,
    max: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.success) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = auditFiltersSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    return NextResponse.json(await auditService.list(parsed.data));
  } catch (error) {
    logger.error("Falha ao listar auditoria", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

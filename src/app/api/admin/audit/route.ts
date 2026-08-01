import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, AdminAccessError } from "@/lib/admin-guard";
import { adminAuditService } from "@/services/admin-audit.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.enum(["LOGIN", "ACCOUNT", "PASSWORD", "TWO_FACTOR", "ADMIN"]).optional(),
  userId: z.string().trim().max(40).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    const status = error instanceof AdminAccessError && error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: "FORBIDDEN" }, { status });
  }

  // Trilha de auditoria é leitura barata mas exportável em massa: limitamos a cadência
  // para que um token roubado não consiga varrer o histórico inteiro em segundos.
  const rateLimit = await checkRateLimit({
    key: "admin-audit",
    identifier: admin.id,
    max: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    return NextResponse.json(await adminAuditService.list(parsed.data));
  } catch (error) {
    logger.error("Falha ao listar auditoria", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

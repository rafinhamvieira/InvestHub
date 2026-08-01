import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, AdminAccessError } from "@/lib/admin-guard";
import { adminUserService } from "@/services/admin-user.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
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

  const rateLimit = await checkRateLimit({
    key: "admin-users",
    identifier: admin.id,
    max: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.success) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    return NextResponse.json(await adminUserService.list(parsed.data));
  } catch (error) {
    logger.error("Falha ao listar usuários", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, authorizationStatus } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminMonitoringService } from "@/services/admin-monitoring.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const querySchema = z.object({ range: z.enum(["24h", "7d", "30d"]).default("24h") });

export async function GET(request: Request) {
  let admin;
  try {
    admin = await requirePermission(Permission.VIEW_SYSTEM_HEALTH);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  const rateLimit = await checkRateLimit({
    key: "admin-monitoring",
    identifier: admin.id,
    max: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.success) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    return NextResponse.json(await adminMonitoringService.series(parsed.data.range));
  } catch (error) {
    logger.error("Falha ao montar a série de monitoramento", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

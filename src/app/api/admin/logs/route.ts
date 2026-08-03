import { NextResponse } from "next/server";
import { requirePermission, authorizationStatus } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminLogService } from "@/services/admin-log.service";
import { logFiltersSchema } from "@/schemas/log.schema";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AppLogLevel } from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let admin;
  try {
    admin = await requirePermission(Permission.VIEW_APPLICATION_LOGS);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  // Cada consulta lê megabytes do disco; sem cadência, uma aba esquecida em atualização
  // automática competiria com a aplicação pelo mesmo disco.
  const rateLimit = await checkRateLimit({
    key: "admin-logs",
    identifier: admin.id,
    max: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.success) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = logFiltersSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  // Sem try/catch em volta: o serviço já trata arquivo ausente e leitura falha como
  // "nenhuma linha", porque log indisponível não é motivo para a tela dar erro.
  return NextResponse.json(
    await adminLogService.list({
      ...parsed.data,
      levels: parsed.data.levels as AppLogLevel[] | undefined,
    }),
  );
}

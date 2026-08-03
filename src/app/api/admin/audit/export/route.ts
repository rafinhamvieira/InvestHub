import { NextResponse } from "next/server";
import { requirePermission, authorizationStatus } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { auditExportSchema } from "@/schemas/audit.schema";
import { auditService } from "@/services/audit.service";
import { toCsv, toExcel } from "@/utils/audit-export";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/** Planilha grande demora a montar; o limite padrão da plataforma não cobre. */
export const maxDuration = 120;

/**
 * Exportação da trilha, em CSV ou Excel.
 *
 * Roda no servidor sobre o mesmo filtro da tela — a interface nunca carrega a base inteira
 * para depois montar arquivo no navegador.
 */
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requirePermission(Permission.VIEW_AUDIT);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  const rateLimit = await checkRateLimit({
    key: "admin-audit-export",
    identifier: admin.id,
    max: 10,
    windowSeconds: 600,
  });
  if (!rateLimit.success) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  const parsed = auditExportSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    const entries = await auditService.listForExport({ ...parsed.data, pageSize: 100 });
    const stamp = new Date().toISOString().slice(0, 10);

    if (parsed.data.format === "xlsx") {
      const buffer = await toExcel(entries);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="auditoria-${stamp}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return new NextResponse(toCsv(entries), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="auditoria-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("Falha ao exportar auditoria", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

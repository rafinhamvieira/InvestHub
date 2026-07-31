import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assumptionInputSchema } from "@/schemas/valuation.schema";
import { valuationService, ValuationError } from "@/services/valuation.service";
import { logger } from "@/lib/logger";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = assumptionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await valuationService.saveAssumption(session.user.id, parsed.data);
    return NextResponse.json({ message: "Premissas salvas." });
  } catch (error) {
    if (error instanceof ValuationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    logger.error("Falha ao salvar premissas", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

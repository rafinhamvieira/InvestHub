import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { portfolioService, PortfolioError } from "@/services/portfolio.service";
import { logger } from "@/lib/logger";

const schema = z.object({ assetId: z.string().min(1) });

/** Registra o resgate de um título de renda fixa, zerando a posição pelo valor corrigido. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    await portfolioService.redeemFixedIncome(session.user.id, parsed.data.assetId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PortfolioError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    logger.error("Falha ao registrar resgate", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { transactionInputSchema } from "@/schemas/transaction.schema";
import { portfolioService, PortfolioError } from "@/services/portfolio.service";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = transactionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await portfolioService.createTransaction(session.user.id, parsed.data);
    return NextResponse.json({ message: "Transação criada." }, { status: 201 });
  } catch (error) {
    if (error instanceof PortfolioError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    logger.error("Falha ao criar transação", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

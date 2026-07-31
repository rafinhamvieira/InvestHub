import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { transactionInputSchema } from "@/schemas/transaction.schema";
import { portfolioService, PortfolioError } from "@/services/portfolio.service";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = transactionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await portfolioService.updateTransaction(session.user.id, id, parsed.data);
    return NextResponse.json({ message: "Transação atualizada." });
  } catch (error) {
    if (error instanceof PortfolioError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    logger.error("Falha ao atualizar transação", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;

  try {
    await portfolioService.deleteTransaction(session.user.id, id);
    return NextResponse.json({ message: "Transação excluída." });
  } catch (error) {
    if (error instanceof PortfolioError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    logger.error("Falha ao excluir transação", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

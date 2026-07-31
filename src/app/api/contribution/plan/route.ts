import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { contributionRequestSchema } from "@/schemas/allocation.schema";
import { contributionService } from "@/services/contribution.service";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = contributionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const plan = await contributionService.buildPlan(session.user.id, parsed.data);
    return NextResponse.json(plan);
  } catch (error) {
    logger.error("Falha ao gerar plano de aporte", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { allocationTargetSchema } from "@/schemas/allocation.schema";
import { allocationService } from "@/services/allocation.service";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = allocationTargetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await allocationService.saveTarget(session.user.id, parsed.data);
    return NextResponse.json({ message: "Meta salva." }, { status: 201 });
  } catch (error) {
    logger.error("Falha ao salvar meta de alocação", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

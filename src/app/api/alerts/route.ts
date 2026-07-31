import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { alertInputSchema } from "@/schemas/alert.schema";
import { alertService, AlertError } from "@/services/alert.service";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = alertInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await alertService.create(session.user.id, parsed.data);
    return NextResponse.json({ message: "Alerta criado." }, { status: 201 });
  } catch (error) {
    if (error instanceof AlertError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    logger.error("Falha ao criar alerta", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

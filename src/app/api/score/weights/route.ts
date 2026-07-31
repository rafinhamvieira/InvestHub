import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scoreWeightsSchema } from "@/schemas/score.schema";
import { scoreService } from "@/services/score.service";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const weights = await scoreService.getWeights(session.user.id);
  return NextResponse.json({ weights });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = scoreWeightsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await scoreService.saveWeights(session.user.id, parsed.data);
  return NextResponse.json({ message: "Pesos salvos." });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await scoreService.resetWeights(session.user.id);
  return NextResponse.json({ message: "Pesos restaurados." });
}

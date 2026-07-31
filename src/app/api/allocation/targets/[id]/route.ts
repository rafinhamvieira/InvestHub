import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { allocationService, AllocationError } from "@/services/allocation.service";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;

  try {
    await allocationService.deleteTarget(session.user.id, id);
    return NextResponse.json({ message: "Meta removida." });
  } catch (error) {
    if (error instanceof AllocationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    logger.error("Falha ao remover meta", { error: (error as Error).message });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

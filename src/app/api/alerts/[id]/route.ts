import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { alertService, AlertError } from "@/services/alert.service";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    await alertService.setStatus(session.user.id, id, parsed.data.active);
    return NextResponse.json({ message: "Alerta atualizado." });
  } catch (error) {
    if (error instanceof AlertError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;

  try {
    await alertService.delete(session.user.id, id);
    return NextResponse.json({ message: "Alerta excluído." });
  } catch (error) {
    if (error instanceof AlertError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

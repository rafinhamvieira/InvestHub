import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { preferencesSchema } from "@/schemas/account.schema";
import { accountService } from "@/services/account.service";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await accountService.updatePreferences(session.user.id, parsed.data);
  return NextResponse.json({ message: "Preferências salvas." });
}

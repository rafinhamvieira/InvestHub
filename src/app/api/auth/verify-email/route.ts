import { NextResponse } from "next/server";
import { verifyEmailSchema } from "@/schemas/auth.schema";
import { authService, AuthError } from "@/services/auth.service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    await authService.verifyEmail(parsed.data.token);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "VERIFY_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ message: "E-mail confirmado com sucesso." });
}

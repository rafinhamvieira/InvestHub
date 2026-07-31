import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/schemas/auth.schema";
import { authService, AuthError } from "@/services/auth.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.flatten() }, { status: 400 });
  }

  const ipAddress = await getClientIp();
  const userAgent = await getUserAgent();

  const rateLimit = await checkRateLimit({
    key: "reset-password",
    identifier: ipAddress,
    max: 10,
    windowSeconds: 3600,
  });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    await authService.resetPassword(parsed.data.token, parsed.data.password, { ipAddress, userAgent });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "RESET_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ message: "Senha redefinida com sucesso." });
}

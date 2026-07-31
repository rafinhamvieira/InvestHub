import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { changePasswordSchema } from "@/schemas/account.schema";
import { accountService, AccountError } from "@/services/account.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: "change-password",
    identifier: session.user.id,
    max: 5,
    windowSeconds: 900,
  });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

  try {
    await accountService.changePassword(session.user.id, parsed.data, { ipAddress, userAgent });
    return NextResponse.json({ message: "Senha alterada." });
  } catch (error) {
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

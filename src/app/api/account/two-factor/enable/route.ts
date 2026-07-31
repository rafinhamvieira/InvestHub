import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enableTwoFactorSchema } from "@/schemas/auth.schema";
import { twoFactorService } from "@/services/two-factor.service";
import { auditLogRepository } from "@/repositories/audit-log.repository";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = enableTwoFactorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const recoveryCodes = await twoFactorService.enable(
      session.user.id,
      parsed.data.secret,
      parsed.data.token,
    );
    await auditLogRepository.record({ userId: session.user.id, action: "TWO_FACTOR_ENABLED" });
    return NextResponse.json({ recoveryCodes });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { disableTwoFactorSchema } from "@/schemas/auth.schema";
import { twoFactorService } from "@/services/two-factor.service";
import { userRepository } from "@/repositories/user.repository";
import { verifyPassword } from "@/lib/crypto";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { AUDIT_ACTIONS } from "@/constants/audit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = disableTwoFactorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const user = await userRepository.findById(session.user.id);
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 400 });
  }

  await twoFactorService.disable(session.user.id);
  await auditLogRepository.record({ userId: session.user.id, action: AUDIT_ACTIONS.TWO_FACTOR_DISABLED });

  return NextResponse.json({ message: "2FA desativado." });
}

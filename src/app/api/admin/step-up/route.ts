import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, markStepUp, authorizationStatus, STEP_UP_TTL_SECONDS } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/crypto";
import { twoFactorService } from "@/services/two-factor.service";
import { auditService } from "@/services/audit.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { AUDIT_ACTIONS } from "@/constants/audit";

const bodySchema = z.object({
  password: z.string().min(1).max(200),
  totpCode: z.string().trim().max(10).optional(),
});

/**
 * Confirmação de identidade do administrador — o "sudo" do painel.
 *
 * Um token roubado dá leitura; sem a senha (e o código MFA, quando ativo) não há como
 * resetar autenticação alheia, trocar e-mail de terceiro, mexer em cargo ou restaurar
 * backup. A confirmação vale por poucos minutos e mora no Redis, nunca no token.
 */
export async function POST(request: Request) {
  let admin;
  try {
    admin = await requirePermission(Permission.MANAGE_USERS);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  // Alvo óbvio de força bruta: é uma verificação de senha exposta a quem já entrou.
  const rateLimit = await checkRateLimit({
    key: "admin-step-up",
    identifier: admin.id,
    max: 5,
    windowSeconds: 300,
  });
  if (!rateLimit.success) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: admin.id },
    select: { passwordHash: true, twoFactorEnabled: true, twoFactorSecret: true },
  });

  const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

  const passwordValid =
    Boolean(user?.passwordHash) && (await verifyPassword(parsed.data.password, user!.passwordHash!));

  const totpValid =
    !user?.twoFactorEnabled ||
    (Boolean(parsed.data.totpCode) &&
      twoFactorService.verifyLogin(user.twoFactorSecret!, parsed.data.totpCode!));

  if (!passwordValid || !totpValid) {
    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_STEP_UP_FAILED,
      result: "FAILED",
      actorId: admin.id,
      actorEmail: admin.email,
      userId: admin.id,
      targetEmail: admin.email,
      sessionId: admin.sessionId,
      metadata: { reason: passwordValid ? "INVALID_TOTP" : "INVALID_PASSWORD" },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      { error: "INVALID_CREDENTIALS", message: "Senha ou código incorretos." },
      { status: 401 },
    );
  }

  await markStepUp(admin.id);
  return NextResponse.json({ ok: true, expiresInSeconds: STEP_UP_TTL_SECONDS });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireStepUp, authorizationStatus } from "@/lib/auth-guard";
import { can, Permission } from "@/lib/permissions";
import { adminUserService, AdminActionError } from "@/services/admin-user.service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, getUserAgent } from "@/utils/request";
import { logger } from "@/lib/logger";

/**
 * Ações administrativas sobre uma conta.
 *
 * União discriminada em vez de um endpoint por ação: cada variante carrega só os campos que
 * lhe pertencem, então nenhuma ação recebe dado que não deveria — "desbloquear" não tem como
 * chegar com um e-mail junto.
 */
const reason = z
  .string()
  .trim()
  .min(10, "Descreva o motivo com pelo menos 10 caracteres.")
  .max(500);

/**
 * Justificativa entra no schema, não no serviço: ação crítica sem motivo é requisição
 * inválida, e a recusa acontece antes de qualquer efeito colateral.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RENAME"), name: z.string().trim().min(2).max(80) }),
  z.object({ action: z.literal("CHANGE_EMAIL"), email: z.string().trim().email().max(160), reason }),
  z.object({ action: z.literal("SEND_PASSWORD_RESET"), reason }),
  z.object({ action: z.literal("RESET_TWO_FACTOR"), reason }),
  z.object({ action: z.literal("UNLOCK"), reason }),
  // Qualquer um dos seis cargos, e não só administrador ou usuário: os demais existiam no
  // mapa desde a Etapa 1 sem caminho pela interface, alcançáveis apenas por script.
  z.object({
    action: z.literal("SET_ROLE"),
    role: z.enum(["USER", "READ_ONLY", "AUDITOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"]),
    reason,
  }),
  z.object({ action: z.literal("REVOKE_SESSION"), sessionId: z.string().min(1).max(64), reason }),
  z.object({ action: z.literal("FORCE_LOGOUT"), reason }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requirePermission(Permission.MANAGE_USERS);
  } catch (error) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: authorizationStatus(error) });
  }

  // Confirmação recente de identidade: token roubado dá leitura, não dá poder de agir
  // sobre conta alheia. A janela é de 10 minutos, renovada ao confirmar a senha.
  try {
    await requireStepUp(admin.id);
  } catch (error) {
    return NextResponse.json(
      { error: "STEP_UP_REQUIRED", message: "Confirme sua senha para continuar." },
      { status: authorizationStatus(error) },
    );
  }

  // Ação administrativa mexe em conta alheia e dispara e-mail: cadência baixa de propósito.
  const rateLimit = await checkRateLimit({
    key: "admin-user-action",
    identifier: admin.id,
    max: 20,
    windowSeconds: 300,
  });
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Muitas ações seguidas. Aguarde alguns minutos." },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });

  const { id } = await params;
  const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
  const ctx = {
    adminId: admin.id,
    adminEmail: admin.email,
    sessionId: admin.sessionId,
    reason: "reason" in parsed.data ? parsed.data.reason : undefined,
    ipAddress,
    userAgent,
  };

  try {
    switch (parsed.data.action) {
      case "RENAME":
        await adminUserService.rename(ctx, id, parsed.data.name);
        break;
      case "CHANGE_EMAIL":
        await adminUserService.changeEmail(ctx, id, parsed.data.email);
        break;
      case "SEND_PASSWORD_RESET":
        await adminUserService.sendPasswordReset(ctx, id);
        break;
      case "RESET_TWO_FACTOR":
        await adminUserService.resetTwoFactor(ctx, id);
        break;
      case "UNLOCK":
        await adminUserService.unlock(ctx, id);
        break;
      case "SET_ROLE":
        // `MANAGE_USERS` não basta: mexer em cargo é a única ação capaz de fabricar um
        // administrador, e o suporte tem `MANAGE_USERS`. A permissão existia no mapa desde a
        // Etapa 1 sem nenhuma verificação — esta é ela.
        if (!can(admin, Permission.MANAGE_ROLES)) {
          return NextResponse.json(
            { error: "FORBIDDEN", message: "Seu cargo não gerencia cargos de outras contas." },
            { status: 403 },
          );
        }
        await adminUserService.setRole(ctx, id, parsed.data.role);
        break;
      case "REVOKE_SESSION":
        await adminUserService.revokeSession(ctx, id, parsed.data.sessionId);
        break;
      case "FORCE_LOGOUT":
        await adminUserService.forceLogout(ctx, id);
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminActionError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "FORBIDDEN" ? 403 : 400 },
      );
    }
    logger.error("Falha em ação administrativa", {
      action: parsed.data.action,
      error: (error as Error).message,
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

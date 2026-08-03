/**
 * Porteiro das rotas administrativas.
 *
 * Três verificações, nesta ordem, em toda requisição administrativa:
 *
 *  1. **papel lido do banco** — o JWT carrega o cargo do momento do login e vale 30 dias;
 *     quem for rebaixado hoje continuaria com um token dizendo ADMIN até ele expirar;
 *  2. **sessão viva** — revogada ou anterior a `sessionsValidFrom` perde o acesso na hora,
 *     mesmo com token válido;
 *  3. **permissão** — nunca comparação de cargo.
 *
 * O middleware faz uma triagem antes disso, pelo token, mas não pode ser a única defesa:
 * ele depende do `matcher`, que uma rota nova pode não cobrir.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { can, Permission, type Principal } from "@/lib/permissions";
import { getClientIp, getUserAgent } from "@/utils/request";
import { auditService } from "@/services/audit.service";
import { sessionService } from "@/services/session.service";
import { platformSettingsService } from "@/services/platform-settings.service";
import { AUDIT_ACTIONS } from "@/constants/audit";

export class AuthorizationError extends Error {
  constructor(public code: "UNAUTHORIZED" | "FORBIDDEN" | "SESSION_REVOKED" | "STEP_UP_REQUIRED") {
    super(code);
    this.name = "AuthorizationError";
  }
}

export interface AdminContext extends Principal {
  email: string;
  name: string | null;
  sessionId: string | null;
  /** A tela de confirmação usa para saber se deve pedir o código do app. */
  twoFactorEnabled: boolean;
}

/**
 * Janela em que a confirmação de senha continua valendo para ações críticas.
 *
 * Ajustável pelo painel, então lida a cada uso — e limitada a uma hora pelo registro de
 * parâmetros: janela longa aproxima o painel de não ter step-up nenhum.
 */
export function stepUpTtlSeconds(): Promise<number> {
  return platformSettingsService.get("stepUpTtlSeconds");
}

function stepUpKey(userId: string): string {
  return `stepup:${userId}`;
}

/**
 * Exige a permissão informada. Lança `AuthorizationError` — as rotas traduzem para HTTP.
 * Toda negativa vira registro de auditoria: sondagem de rota administrativa precisa aparecer.
 */
export async function requirePermission(permission: Permission): Promise<AdminContext> {
  const session = await auth();
  const userId = session?.user?.id;
  const sessionId = (session?.user as { sessionId?: string } | undefined)?.sessionId ?? null;

  if (!userId) throw new AuthorizationError("UNAUTHORIZED");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      sessionsValidFrom: true,
      twoFactorEnabled: true,
    },
  });

  if (!user) throw new AuthorizationError("UNAUTHORIZED");

  if (sessionId && !(await sessionService.isActive(sessionId, user.sessionsValidFrom))) {
    throw new AuthorizationError("SESSION_REVOKED");
  }

  if (!can(user, permission)) {
    const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
    await auditService
      .record({
        action: AUDIT_ACTIONS.ADMIN_ACCESS_DENIED,
        result: "FAILED",
        actorId: user.id,
        actorEmail: user.email,
        sessionId,
        metadata: { permission },
        ipAddress,
        userAgent,
      })
      .catch((error) => logger.error("Falha ao auditar acesso negado", { error: String(error) }));

    logger.warn("Acesso administrativo negado", { userId: user.id, permission });
    throw new AuthorizationError("FORBIDDEN");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionId,
    twoFactorEnabled: user.twoFactorEnabled,
  };
}

/** Verificação sem efeito colateral — decide o que renderizar, nunca o que autorizar. */
export async function currentPrincipal(): Promise<Principal | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });

  return user ?? null;
}

/**
 * Confirmação recente de identidade para ações críticas — o "sudo" do painel.
 *
 * Um token roubado dá acesso de leitura; sem a senha do administrador, não dá para resetar
 * MFA, trocar e-mail de terceiro, mexer em cargo ou restaurar backup.
 */
export async function markStepUp(userId: string): Promise<void> {
  const ttl = await stepUpTtlSeconds();
  await redis.set(stepUpKey(userId), "1", "EX", ttl).catch(() => null);
}

export async function hasStepUp(userId: string): Promise<boolean> {
  try {
    return (await redis.get(stepUpKey(userId))) !== null;
  } catch {
    // Cache indisponível: negamos. Ação crítica sem confirmação é pior que indisponibilidade.
    return false;
  }
}

export async function requireStepUp(userId: string): Promise<void> {
  if (!(await hasStepUp(userId))) throw new AuthorizationError("STEP_UP_REQUIRED");
}

/** Tradução única para HTTP, para as rotas não repetirem o mapa de códigos. */
export function authorizationStatus(error: unknown): number {
  if (!(error instanceof AuthorizationError)) return 500;

  switch (error.code) {
    case "UNAUTHORIZED":
    case "SESSION_REVOKED":
      return 401;
    case "STEP_UP_REQUIRED":
      return 428; // Precondition Required
    case "FORBIDDEN":
      return 403;
  }
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getClientIp, getUserAgent } from "@/utils/request";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { AUDIT_ACTIONS } from "@/constants/audit";

export class AdminAccessError extends Error {
  constructor(public code: "UNAUTHORIZED" | "FORBIDDEN") {
    super(code);
    this.name = "AdminAccessError";
  }
}

export interface AdminContext {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Porteiro das rotas administrativas.
 *
 * O papel é lido do **banco**, não da sessão. O JWT carrega o `role` do momento do login e
 * vale 30 dias: quem for rebaixado continuaria com um token dizendo `ADMIN` até expirar.
 * Uma consulta por requisição administrativa é barata perto disso.
 *
 * O middleware também barra `/admin` e `/api/admin`, mas ele não pode ser a única defesa —
 * `matcher` é fácil de furar com uma rota nova, e já vimos neste projeto o que acontece
 * quando uma camada sozinha decide quem entra.
 *
 * Toda negativa vira registro de auditoria: tentativa de acessar área administrativa é
 * exatamente o tipo de evento que precisa aparecer na trilha.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new AdminAccessError("UNAUTHORIZED");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user || user.role !== "ADMIN") {
    const [ipAddress, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
    await auditLogRepository
      .record({
        userId: session.user.id,
        action: AUDIT_ACTIONS.ADMIN_ACCESS_DENIED,
        ipAddress,
        userAgent,
      })
      .catch(() => null);

    logger.warn("Acesso administrativo negado", { userId: session.user.id, ipAddress });
    throw new AdminAccessError("FORBIDDEN");
  }

  return { id: user.id, email: user.email, name: user.name };
}

/** Verificação sem efeito colateral, para decidir o que renderizar no menu. */
export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  return user?.role === "ADMIN";
}

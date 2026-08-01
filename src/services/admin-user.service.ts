/**
 * Ações administrativas sobre contas.
 *
 * A fronteira deste serviço é deliberada: ele lê e escreve **identidade e acesso**, nunca
 * dado financeiro. Não importa `transaction.repository`, `position.repository` nem
 * `portfolio.service` — e um teste vigia esses imports, porque a promessa ao usuário é que
 * o administrador não enxerga a carteira dele.
 *
 * Toda ação segue o mesmo rito: verificar a política, aplicar, registrar na auditoria e
 * avisar o usuário afetado por e-mail. O aviso não é opcional — é o que impede alteração
 * silenciosa numa conta alheia.
 */

import { userRepository } from "@/repositories/user.repository";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { loginAuditRepository } from "@/repositories/login-audit.repository";
import { authService } from "@/services/auth.service";
import { sendEmail, adminActionEmailTemplate } from "@/lib/email";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS } from "@/constants/audit";
import { canPerform, POLICY_MESSAGES, type AdminAction } from "@/utils/admin-policy";
import type { AdminUserPage, AdminUserRow } from "@/types/audit";

export class AdminActionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminActionError";
  }
}

interface ActionContext {
  adminId: string;
  ipAddress?: string;
  userAgent?: string;
}

const MAX_PAGE_SIZE = 100;

/**
 * Quanto falta para o cadastro não confirmado ser removido automaticamente.
 * Mostrar o prazo evita a surpresa de ver uma conta sumir da lista sem explicação.
 */
function hoursUntilRemoval(user: {
  emailVerified: Date | null;
  role: string;
  createdAt: Date;
}): number | null {
  if (user.emailVerified !== null || user.role === "ADMIN") return null;

  const ttlHours = Number(process.env.UNVERIFIED_ACCOUNT_TTL_HOURS ?? 24);
  const elapsed = (Date.now() - user.createdAt.getTime()) / (60 * 60 * 1000);
  return Math.max(0, Math.ceil(ttlHours - elapsed));
}

async function loadTarget(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw new AdminActionError("NOT_FOUND", "Usuário não encontrado.");
  return user;
}

/** Verifica a política e devolve o alvo; centralizado para nenhuma ação esquecer o passo. */
async function authorize(action: AdminAction, ctx: ActionContext, userId: string) {
  const target = await loadTarget(userId);
  const decision = canPerform(action, {
    actorId: ctx.adminId,
    targetId: target.id,
    targetRole: target.role,
  });

  if (!decision.allowed) {
    throw new AdminActionError("FORBIDDEN", POLICY_MESSAGES[decision.reason!]);
  }

  return target;
}

async function notifyUser(email: string, action: string, detail: string): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: "InvestHub — alteração na sua conta",
      html: adminActionEmailTemplate(action, detail),
    });
  } catch (error) {
    // Falha de envio não desfaz a ação: o registro de auditoria já garante o rastro.
    logger.error("Falha ao avisar usuário sobre ação administrativa", {
      error: (error as Error).message,
    });
  }
}

export const adminUserService = {
  async list(options: { search?: string; page: number; pageSize: number }): Promise<AdminUserPage> {
    const pageSize = Math.min(Math.max(options.pageSize, 1), MAX_PAGE_SIZE);
    const page = Math.max(options.page, 1);

    const { rows, total } = await userRepository.listForAdmin({ ...options, page, pageSize });
    const lastLogins = await loginAuditRepository.lastSuccessByUsers(rows.map((row) => row.id));

    const users: AdminUserRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      emailVerified: row.emailVerified !== null,
      twoFactorEnabled: row.twoFactorEnabled,
      lockedUntil: row.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil.toISOString() : null,
      failedLoginAttempts: row.failedLoginAttempts,
      lastLoginAt: lastLogins.get(row.id)?.toISOString() ?? null,
      expiresInHours: hoursUntilRemoval(row),
      createdAt: row.createdAt.toISOString(),
    }));

    return { users, total, page, pageSize };
  },

  async rename(ctx: ActionContext, userId: string, name: string): Promise<void> {
    const target = await authorize("RENAME", ctx, userId);
    const previous = target.name;

    await userRepository.update(userId, { name });
    await auditLogRepository.record({
      userId: ctx.adminId,
      action: AUDIT_ACTIONS.ADMIN_USER_RENAMED,
      entity: "User",
      entityId: userId,
      metadata: { from: previous, to: name },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await notifyUser(
      target.email,
      "Nome alterado",
      `O nome da sua conta foi alterado de "${previous ?? "—"}" para "${name}" por um administrador.`,
    );
  },

  /**
   * Troca o e-mail e derruba a verificação: o endereço novo só vale depois de o dono da
   * caixa clicar no link. O endereço antigo é avisado — se a troca não foi combinada, é por
   * ali que a pessoa descobre.
   */
  async changeEmail(ctx: ActionContext, userId: string, email: string): Promise<void> {
    const target = await authorize("CHANGE_EMAIL", ctx, userId);
    const normalized = email.trim().toLowerCase();

    if (normalized === target.email) {
      throw new AdminActionError("SAME_EMAIL", "O e-mail informado é o atual.");
    }

    const existing = await userRepository.findByEmail(normalized);
    if (existing) {
      throw new AdminActionError("EMAIL_IN_USE", "Já existe uma conta com este e-mail.");
    }

    await userRepository.updateEmail(userId, normalized);
    await auditLogRepository.record({
      userId: ctx.adminId,
      action: AUDIT_ACTIONS.ADMIN_USER_EMAIL_CHANGED,
      entity: "User",
      entityId: userId,
      metadata: { from: target.email, to: normalized },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await notifyUser(
      target.email,
      "E-mail da conta alterado",
      `O e-mail da sua conta foi alterado para ${normalized} por um administrador. ` +
        "Se não foi você quem pediu, procure o suporte imediatamente.",
    );

    // Link de confirmação para o endereço novo; enquanto não confirmar, o login fica barrado.
    await authService.sendVerificationEmail(normalized, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  /**
   * Dispara o fluxo normal de recuperação. O administrador nunca conhece a senha: quem a
   * define é o usuário, pelo link enviado ao e-mail dele.
   */
  async sendPasswordReset(ctx: ActionContext, userId: string): Promise<void> {
    const target = await authorize("SEND_PASSWORD_RESET", ctx, userId);

    await authService.requestPasswordReset(target.email, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await auditLogRepository.record({
      userId: ctx.adminId,
      action: AUDIT_ACTIONS.ADMIN_PASSWORD_RESET_SENT,
      entity: "User",
      entityId: userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  /**
   * Remove o 2FA de quem perdeu o aplicativo e os códigos de recuperação.
   *
   * É a ação mais perigosa do painel — derruba um fator de autenticação inteiro — e por
   * isso avisa o usuário e fica registrada com autor, alvo, IP e horário.
   */
  async resetTwoFactor(ctx: ActionContext, userId: string): Promise<void> {
    const target = await authorize("RESET_TWO_FACTOR", ctx, userId);

    if (!target.twoFactorEnabled) {
      throw new AdminActionError("NOT_ENABLED", "Esta conta não usa autenticação em duas etapas.");
    }

    await userRepository.disableTwoFactor(userId);
    await auditLogRepository.record({
      userId: ctx.adminId,
      action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN,
      entity: "User",
      entityId: userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await notifyUser(
      target.email,
      "Autenticação em duas etapas removida",
      "Um administrador removeu o 2FA da sua conta. Configure novamente em Configurações → Segurança " +
        "para voltar a proteger o acesso.",
    );
  },

  /**
   * Concede ou remove permissão de administrador.
   *
   * Vale só no próximo login de quem foi alterado: o papel viaja no token da sessão. Quem
   * acabou de ser rebaixado ainda passa pelo middleware até o token expirar — mas esbarra
   * no `requireAdmin()`, que confere o papel no banco a cada requisição.
   */
  async setRole(ctx: ActionContext, userId: string, role: "USER" | "ADMIN"): Promise<void> {
    const action = role === "ADMIN" ? "GRANT_ADMIN" : "REVOKE_ADMIN";
    const target = await authorize(action, ctx, userId);

    await userRepository.setRole(userId, role);
    await auditLogRepository.record({
      userId: ctx.adminId,
      action: role === "ADMIN" ? AUDIT_ACTIONS.ADMIN_ROLE_GRANTED : AUDIT_ACTIONS.ADMIN_ROLE_REVOKED,
      entity: "User",
      entityId: userId,
      metadata: { from: target.role, to: role },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await notifyUser(
      target.email,
      role === "ADMIN" ? "Permissão de administrador concedida" : "Permissão de administrador removida",
      role === "ADMIN"
        ? "Sua conta agora tem acesso ao painel de administração. O acesso vale a partir do próximo login."
        : "Sua conta não tem mais acesso ao painel de administração.",
    );
  },

  async unlock(ctx: ActionContext, userId: string): Promise<void> {
    const target = await authorize("UNLOCK", ctx, userId);

    await userRepository.unlock(userId);
    await auditLogRepository.record({
      userId: ctx.adminId,
      action: AUDIT_ACTIONS.ADMIN_ACCOUNT_UNLOCKED,
      entity: "User",
      entityId: userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await notifyUser(
      target.email,
      "Conta desbloqueada",
      "O bloqueio por tentativas de login foi removido. Você já pode acessar normalmente.",
    );
  },
};

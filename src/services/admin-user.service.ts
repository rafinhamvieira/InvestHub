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
import { auditService } from "@/services/audit.service";
import { sessionService } from "@/services/session.service";
import { loginAuditRepository } from "@/repositories/login-audit.repository";
import { userSessionRepository } from "@/repositories/user-session.repository";
import { hasAdminAccess, isOwnerRole, ROLE_PERMISSIONS } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { authService } from "@/services/auth.service";
import { sendEmail, adminActionEmailTemplate } from "@/lib/email";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS } from "@/constants/audit";
import { canPerform, POLICY_MESSAGES, type AdminAction } from "@/utils/admin-policy";
import { describeSession, parseUserAgent } from "@/utils/user-agent";
import { platformSettingsService } from "@/services/platform-settings.service";
import type {
  AdminLoginRow,
  AdminSessionRow,
  AdminUserDetail,
  AdminUserPage,
  AdminUserRow,
} from "@/types/audit";

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
  adminEmail: string;
  sessionId?: string | null;
  /** Justificativa; obrigatória nas ações críticas, validada no schema da rota. */
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

const MAX_PAGE_SIZE = 100;

/**
 * Quanto falta para o cadastro não confirmado ser removido automaticamente.
 * Mostrar o prazo evita a surpresa de ver uma conta sumir da lista sem explicação.
 */
function hoursUntilRemoval(
  user: { emailVerified: Date | null; role: Role; createdAt: Date },
  ttlHours: number,
): number | null {
  if (user.emailVerified !== null || hasAdminAccess({ id: "", role: user.role })) return null;

  const elapsed = (Date.now() - user.createdAt.getTime()) / (60 * 60 * 1000);
  return Math.max(0, Math.ceil(ttlHours - elapsed));
}

/**
 * Linha da conta como as telas administrativas a enxergam.
 *
 * Um lugar só para listagem e detalhe: campo novo aparece nos dois, e — mais importante —
 * campo que não deve aparecer não entra por descuido em um deles.
 */
function toUserRow(
  user: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
    emailVerified: Date | null;
    twoFactorEnabled: boolean;
    lockedUntil: Date | null;
    failedLoginAttempts: number;
    createdAt: Date;
  },
  lastLoginAt: Date | null,
  activeSessions: number,
  ttlHours: number,
): AdminUserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified !== null,
    twoFactorEnabled: user.twoFactorEnabled,
    lockedUntil:
      user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil.toISOString() : null,
    failedLoginAttempts: user.failedLoginAttempts,
    lastLoginAt: lastLoginAt?.toISOString() ?? null,
    expiresInHours: hoursUntilRemoval(user, ttlHours),
    activeSessions,
    createdAt: user.createdAt.toISOString(),
  };
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
    // Duas consultas em lote para a página inteira — nunca uma por linha.
    const ids = rows.map((row) => row.id);
    const [lastLogins, activeSessions, ttlHours] = await Promise.all([
      loginAuditRepository.lastSuccessByUsers(ids),
      userSessionRepository.countActiveByUsers(ids),
      platformSettingsService.get("unverifiedAccountTtlHours"),
    ]);

    const users = rows.map((row) =>
      toUserRow(row, lastLogins.get(row.id) ?? null, activeSessions.get(row.id) ?? 0, ttlHours),
    );

    return { users, total, page, pageSize };
  },

  /** Quantas contas há em cada cargo — alimenta a matriz de permissões. */
  async roleCounts(): Promise<Record<string, number>> {
    const roles = Object.keys(ROLE_PERMISSIONS) as Role[];
    const counts = await Promise.all(
      roles.map(async (role) => [role, await userRepository.countByRole(role)] as const),
    );

    return Object.fromEntries(counts);
  },

  /**
   * Tudo o que o painel mostra sobre uma conta: identidade, sessões, acessos e o que já foi
   * feito sobre ela.
   *
   * As quatro consultas são independentes e vão em paralelo. Nenhuma toca em carteira.
   */
  async detail(userId: string): Promise<AdminUserDetail> {
    const target = await loadTarget(userId);

    const [sessions, logins, lastLogins, activeSessions, trail, ttlHours] = await Promise.all([
      userSessionRepository.listByUser(userId),
      loginAuditRepository.listByUser(userId, 20),
      loginAuditRepository.lastSuccessByUsers([userId]),
      userSessionRepository.countActiveByUsers([userId]),
      // A trilha filtrada por conta cobre os dois lados: o que fizeram com ela e o que ela
      // fez. Para uma conta comum o segundo conjunto é o histórico de login e senha.
      auditService.list({ userId, pageSize: 25 }),
      platformSettingsService.get("unverifiedAccountTtlHours"),
    ]);

    const now = new Date();

    return {
      user: toUserRow(target, lastLogins.get(userId) ?? null, activeSessions.get(userId) ?? 0, ttlHours),
      sessions: sessions.map((session): AdminSessionRow => {
        const { browser, os, location, ...rest } = session;

        return {
          id: rest.id,
          type: rest.type,
          device: describeSession({ browser, os, location }),
          ipAddress: rest.ipAddress,
          createdAt: rest.createdAt.toISOString(),
          lastSeenAt: rest.lastSeenAt.toISOString(),
          expiresAt: rest.expiresAt.toISOString(),
          revokedAt: rest.revokedAt?.toISOString() ?? null,
          revocationReason: rest.revocationReason,
          active: rest.revokedAt === null && rest.expiresAt > now,
        };
      }),
      logins: logins.map(
        (login): AdminLoginRow => ({
          id: login.id,
          success: login.success,
          ipAddress: login.ipAddress,
          device: describeSession({ ...parseUserAgent(login.userAgent), location: null }),
          reason: login.reason,
          createdAt: login.createdAt.toISOString(),
        }),
      ),
      events: trail.entries,
    };
  },

  /**
   * Encerra uma sessão específica.
   *
   * Passa pelo `sessionService` em vez de escrever direto: é ele que derruba a entrada de
   * cache da validade. Revogar por fora deixaria a sessão viva até o cache expirar — e o
   * sentido da ação é justamente cortar o acesso agora.
   */
  async revokeSession(ctx: ActionContext, userId: string, sessionId: string): Promise<void> {
    const target = await authorize("REVOKE_SESSION", ctx, userId);

    const session = await userSessionRepository.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new AdminActionError("NOT_FOUND", "Sessão não encontrada nesta conta.");
    }
    if (session.revokedAt !== null) {
      throw new AdminActionError("ALREADY_APPLIED", "Esta sessão já estava encerrada.");
    }

    await sessionService.revoke({
      sessionId,
      userId,
      userEmail: target.email,
      revokedBy: ctx.adminId,
      actorEmail: ctx.adminEmail,
      reason: ctx.reason ?? "Encerrada pelo administrador",
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await notifyUser(
      target.email,
      "Sessão encerrada",
      "Um acesso à sua conta foi encerrado pela administração da plataforma. " +
        "Se não reconhece o acesso, troque sua senha.",
    );
  },

  /**
   * Derruba todas as sessões da conta.
   *
   * Duas escritas, e as duas importam: revogar as linhas dá o registro de quem encerrou o
   * quê e por quê; mover `sessionsValidFrom` é o que invalida **tokens** já emitidos, que
   * são apátridas e continuariam valendo até expirar, trinta dias depois.
   *
   * Sobre a própria conta, a marca é recuada até o nascimento da sessão em uso — assim o
   * administrador derruba todo o resto sem se expulsar no meio da operação.
   */
  async forceLogout(ctx: ActionContext, userId: string): Promise<number> {
    const target = await authorize("FORCE_LOGOUT", ctx, userId);
    const isSelf = ctx.adminId === userId;

    const current = isSelf && ctx.sessionId ? await userSessionRepository.findById(ctx.sessionId) : null;
    const validFrom = current?.createdAt ?? new Date();

    const { count } = await userSessionRepository.revokeAllForUser(
      userId,
      ctx.adminId,
      ctx.reason ?? "Sessões encerradas pelo administrador",
      current?.id,
    );

    await userRepository.invalidateSessionsBefore(userId, validFrom);

    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_SESSIONS_REVOKED,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      userId,
      targetEmail: target.email,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
      entity: "User",
      entityId: userId,
      metadata: { sessionsRevoked: count, keptCurrent: Boolean(current) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await notifyUser(
      target.email,
      "Acessos encerrados",
      `${count} acesso(s) à sua conta foram encerrados pela administração da plataforma. ` +
        "Você precisará entrar novamente. Se não reconhece a ação, troque sua senha.",
    );

    return count;
  },

  async rename(ctx: ActionContext, userId: string, name: string): Promise<void> {
    const target = await authorize("RENAME", ctx, userId);
    const previous = target.name;

    await userRepository.update(userId, { name });
    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_USER_RENAMED,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      userId,
      targetEmail: target.email,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
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
    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_USER_EMAIL_CHANGED,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      userId,
      targetEmail: target.email,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
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

    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_PASSWORD_RESET_SENT,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      userId,
      targetEmail: target.email,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
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
    await auditService.record({
      action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      userId,
      targetEmail: target.email,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
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
   * Vale só no próximo login de quem foi alterado: o cargo viaja no token da sessão. Quem
   * acabou de ser rebaixado ainda passa pelo middleware até o token expirar — mas esbarra
   * no guard de cada rota, que confere o cargo no banco a cada requisição.
   */
  /**
   * Troca o cargo da conta.
   *
   * Quem chama precisa ter `MANAGE_ROLES` — conferido na rota, porque é permissão do autor e
   * não regra sobre o alvo. Ela existia no mapa desde a Etapa 1 sem nenhuma verificação, e a
   * ausência abria escalada: `MANAGE_USERS` sozinha bastava para promover alguém a
   * administrador, e o suporte tem `MANAGE_USERS`.
   */
  async setRole(ctx: ActionContext, userId: string, role: Role): Promise<void> {
    // "Conceder" é definido pelo mapa de permissões: cargo novo com acesso ao painel entra
    // nesta conta automaticamente.
    const granting = hasAdminAccess({ id: userId, role });
    const action = granting ? "GRANT_ADMIN" : "REVOKE_ADMIN";
    const target = await authorize(action, ctx, userId);

    if (target.role === role) {
      throw new AdminActionError("ALREADY_APPLIED", "A conta já está neste cargo.");
    }

    // A plataforma não pode ficar sem quem gerencia cargos, restaura backup e atesta a
    // trilha. Sem esta guarda, duas contas podem se rebaixar em sequência e trancar todo
    // mundo do lado de fora — sem caminho de volta pela interface.
    const leavingOwnership = isOwnerRole(target.role) && !isOwnerRole(role);
    if (leavingOwnership && (await userRepository.countByRole(target.role)) <= 1) {
      throw new AdminActionError(
        "LAST_OWNER",
        "Esta é a única conta com o cargo mais alto. Promova outra antes de rebaixá-la.",
      );
    }

    await userRepository.setRole(userId, role);
    await auditService.record({
      action: granting ? AUDIT_ACTIONS.ADMIN_ROLE_GRANTED : AUDIT_ACTIONS.ADMIN_ROLE_REVOKED,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      userId,
      targetEmail: target.email,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
      entity: "User",
      entityId: userId,
      metadata: { from: target.role, to: role },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    await notifyUser(
      target.email,
      granting ? "Permissão de administrador concedida" : "Permissão de administrador removida",
      granting
        ? "Sua conta agora tem acesso ao painel de administração. O acesso vale a partir do próximo login."
        : "Sua conta não tem mais acesso ao painel de administração.",
    );
  },

  async unlock(ctx: ActionContext, userId: string): Promise<void> {
    const target = await authorize("UNLOCK", ctx, userId);

    await userRepository.unlock(userId);
    await auditService.record({
      action: AUDIT_ACTIONS.ADMIN_ACCOUNT_UNLOCKED,
      actorId: ctx.adminId,
      actorEmail: ctx.adminEmail,
      userId,
      targetEmail: target.email,
      sessionId: ctx.sessionId,
      reason: ctx.reason,
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

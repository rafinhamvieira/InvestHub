import { userRepository } from "@/repositories/user.repository";
import { loginAuditRepository } from "@/repositories/login-audit.repository";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { passwordResetRepository } from "@/repositories/password-reset.repository";
import { verificationTokenRepository } from "@/repositories/verification-token.repository";
import { hashPassword, verifyPassword, generateSecureToken } from "@/lib/crypto";
import { sendEmail, verificationEmailTemplate, passwordResetEmailTemplate } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { twoFactorService } from "@/services/two-factor.service";
import { AUTH_CONSTANTS, AUTH_ERROR_CODES } from "@/constants/auth";
import { AUDIT_ACTIONS } from "@/constants/audit";
import type { RegisterInput, LoginInput } from "@/schemas/auth.schema";

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}

export const authService = {
  async register(input: RegisterInput, ctx: RequestContext): Promise<void> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      // Não revela que o e-mail já existe: comportamento idêntico ao de sucesso.
      await auditLogRepository.record({
        action: AUDIT_ACTIONS.REGISTER_ATTEMPT_DUPLICATE,
        entity: "User",
        metadata: { email: input.email },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return;
    }

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
    });

    await auditLogRepository.record({
      userId: user.id,
      action: AUDIT_ACTIONS.USER_REGISTERED,
      entity: "User",
      entityId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // A conta já existe neste ponto. Uma falha no envio (provedor fora do ar, remetente
    // não verificado) não deve derrubar o cadastro e deixar a conta órfã e inacessível:
    // registramos o erro e a pessoa pede um novo link pelo botão de reenvio no login.
    try {
      await this.sendVerificationEmail(user.email, ctx);
    } catch (error) {
      logger.error("Conta criada, mas o e-mail de confirmação falhou", {
        userId: user.id,
        email: user.email,
        error: (error as Error).message,
      });
    }
  },

  async sendVerificationEmail(email: string, ctx: RequestContext): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user || user.emailVerified) return;

    const rateLimit = await checkRateLimit({
      key: "verify-email-send",
      identifier: email,
      max: 3,
      windowSeconds: 300,
    });
    if (!rateLimit.success) return;

    await verificationTokenRepository.invalidateAllForIdentifier(email);
    const token = generateSecureToken();
    const expires = new Date(
      Date.now() + AUTH_CONSTANTS.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );
    await verificationTokenRepository.create(email, token, expires);

    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`;
    await sendEmail({
      to: email,
      subject: "Confirme seu e-mail — InvestHub",
      html: verificationEmailTemplate(verifyUrl),
    });

    void ctx;
  },

  async verifyEmail(token: string): Promise<void> {
    const record = await verificationTokenRepository.findValidByToken(token);
    if (!record) throw new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, "Token inválido ou expirado.");

    const user = (await userRepository.findByEmail(record.identifier))!;
    await userRepository.markEmailVerified(user.id);
    await verificationTokenRepository.deleteByToken(token);
    await auditLogRepository.record({ userId: user.id, action: AUDIT_ACTIONS.EMAIL_VERIFIED });
  },

  async requestPasswordReset(email: string, ctx: RequestContext): Promise<void> {
    const rateLimit = await checkRateLimit({
      key: "password-reset-request",
      identifier: `${email}:${ctx.ipAddress ?? "unknown"}`,
      max: 3,
      windowSeconds: 900,
    });
    if (!rateLimit.success) return;

    const user = await userRepository.findByEmail(email);
    if (!user) return; // não revela existência do e-mail

    await passwordResetRepository.invalidateAllForUser(user.id);
    const token = generateSecureToken();
    const expiresAt = new Date(
      Date.now() + AUTH_CONSTANTS.PASSWORD_RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );
    await passwordResetRepository.create(user.id, token, expiresAt);

    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: "Redefinição de senha — InvestHub",
      html: passwordResetEmailTemplate(resetUrl),
    });

    await auditLogRepository.record({
      userId: user.id,
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  async resetPassword(token: string, newPassword: string, ctx: RequestContext): Promise<void> {
    const record = await passwordResetRepository.findValidByToken(token);
    if (!record) {
      throw new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, "Token inválido ou expirado.");
    }

    // Redefinir para a mesma senha não corrige um vazamento — exigimos uma senha diferente.
    if (record.user.passwordHash && (await verifyPassword(newPassword, record.user.passwordHash))) {
      throw new AuthError(
        AUTH_ERROR_CODES.SAME_PASSWORD,
        "A nova senha precisa ser diferente da senha atual.",
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePasswordHash(record.userId, passwordHash);
    await passwordResetRepository.markUsed(record.id);
    await passwordResetRepository.invalidateAllForUser(record.userId);

    await auditLogRepository.record({
      userId: record.userId,
      action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },

  /**
   * Usado pelo CredentialsProvider.authorize() do Auth.js. Lança AuthError com código
   * estável — o client decide a UX (ex: revelar campo de código 2FA) a partir do código.
   */
  async authenticate(input: LoginInput, ctx: RequestContext): Promise<AuthenticatedUser> {
    const rateLimitKey = ctx.ipAddress ?? input.email;
    const rateLimit = await checkRateLimit({
      key: "login",
      identifier: rateLimitKey,
      max: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5),
      windowSeconds: Number(process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS ?? 60),
    });
    if (!rateLimit.success) {
      throw new AuthError(AUTH_ERROR_CODES.RATE_LIMITED, "Muitas tentativas. Tente novamente em instantes.");
    }

    const user = await userRepository.findByEmail(input.email);

    const fail = async (reason: string) => {
      await loginAuditRepository.record({
        userId: user?.id,
        email: input.email,
        success: false,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        reason,
      });
    };

    if (!user || !user.passwordHash) {
      await fail("USER_NOT_FOUND");
      throw new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, "E-mail ou senha inválidos.");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await fail("ACCOUNT_LOCKED");
      throw new AuthError(AUTH_ERROR_CODES.ACCOUNT_LOCKED, "Conta temporariamente bloqueada por excesso de tentativas.");
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= AUTH_CONSTANTS.MAX_FAILED_ATTEMPTS;
      await userRepository.incrementFailedAttempts(
        user.id,
        shouldLock
          ? new Date(Date.now() + AUTH_CONSTANTS.LOCK_DURATION_MINUTES * 60 * 1000)
          : null,
      );
      await fail("WRONG_PASSWORD");

      // O bloqueio é evento de segurança por si só: quem investiga precisa vê-lo na trilha
      // de ações, não apenas deduzi-lo contando tentativas na trilha de acessos.
      if (shouldLock) {
        await auditLogRepository.record({
          userId: user.id,
          action: AUDIT_ACTIONS.ACCOUNT_LOCKED,
          metadata: { attempts, lockMinutes: AUTH_CONSTANTS.LOCK_DURATION_MINUTES },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });
      }
      throw new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, "E-mail ou senha inválidos.");
    }

    if (!user.emailVerified) {
      await fail("EMAIL_NOT_VERIFIED");
      throw new AuthError(AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED, "Confirme seu e-mail antes de entrar.");
    }

    if (user.twoFactorEnabled) {
      if (input.recoveryCode) {
        const valid = await twoFactorService.verifyRecoveryCode(
          user.id,
          user.twoFactorRecoveryCodes,
          input.recoveryCode,
        );
        if (!valid) {
          await fail("INVALID_RECOVERY_CODE");
          throw new AuthError(AUTH_ERROR_CODES.INVALID_TWO_FACTOR_CODE, "Código de recuperação inválido.");
        }
      } else if (input.totpCode) {
        const valid = twoFactorService.verifyLogin(user.twoFactorSecret!, input.totpCode);
        if (!valid) {
          await fail("INVALID_TOTP");
          throw new AuthError(AUTH_ERROR_CODES.INVALID_TWO_FACTOR_CODE, "Código de autenticação inválido.");
        }
      } else {
        throw new AuthError(AUTH_ERROR_CODES.TWO_FACTOR_REQUIRED, "Informe o código de autenticação em duas etapas.");
      }
    }

    await userRepository.resetFailedAttempts(user.id);
    await loginAuditRepository.record({
      userId: user.id,
      email: user.email,
      success: true,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
  },
};

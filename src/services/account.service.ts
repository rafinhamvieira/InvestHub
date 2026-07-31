import { userRepository } from "@/repositories/user.repository";
import { loginAuditRepository } from "@/repositories/login-audit.repository";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { passwordResetRepository } from "@/repositories/password-reset.repository";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import type { ProfileInput, PreferencesInput, ChangePasswordInput } from "@/schemas/account.schema";
import type { RiskProfile } from "@prisma/client";

export class AccountError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export interface AccountOverview {
  name: string | null;
  email: string;
  riskProfile: RiskProfile;
  currency: string;
  locale: string;
  theme: string;
  emailNotifications: boolean;
  twoFactorEnabled: boolean;
  loginHistory: Array<{
    id: string;
    success: boolean;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
  }>;
}

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export const accountService = {
  async getOverview(userId: string): Promise<AccountOverview> {
    const user = await userRepository.findById(userId);
    if (!user) throw new AccountError("NOT_FOUND", "Usuário não encontrado.");

    const audits = await loginAuditRepository.listByUser(userId, 20);

    return {
      name: user.name,
      email: user.email,
      riskProfile: user.riskProfile,
      currency: user.currency,
      locale: user.locale,
      theme: user.theme,
      emailNotifications: user.emailNotifications,
      twoFactorEnabled: user.twoFactorEnabled,
      loginHistory: audits.map((audit) => ({
        id: audit.id,
        success: audit.success,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        createdAt: audit.createdAt.toISOString(),
      })),
    };
  },

  async updateProfile(userId: string, input: ProfileInput): Promise<void> {
    await userRepository.update(userId, { name: input.name, riskProfile: input.riskProfile });
  },

  async updatePreferences(userId: string, input: PreferencesInput): Promise<void> {
    await userRepository.update(userId, {
      currency: input.currency,
      theme: input.theme,
      locale: input.locale,
      emailNotifications: input.emailNotifications,
    });
  },

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user?.passwordHash) throw new AccountError("NOT_FOUND", "Usuário não encontrado.");

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) throw new AccountError("INVALID_PASSWORD", "Senha atual incorreta.");

    if (input.currentPassword === input.newPassword) {
      throw new AccountError(
        "SAME_PASSWORD",
        "A nova senha precisa ser diferente da senha atual.",
      );
    }

    await userRepository.updatePasswordHash(userId, await hashPassword(input.newPassword));
    await passwordResetRepository.invalidateAllForUser(userId);
    await auditLogRepository.record({
      userId,
      action: "PASSWORD_CHANGED",
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  },
};

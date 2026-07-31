import { authenticator } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { userRepository } from "@/repositories/user.repository";

const ISSUER = "InvestHub";
const RECOVERY_CODE_COUNT = 8;

export interface TwoFactorSetup {
  secret: string;
  qrCodeDataUrl: string;
  otpauthUrl: string;
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    crypto.randomBytes(5).toString("hex").toUpperCase(),
  );
}

export const twoFactorService = {
  async generateSetup(email: string): Promise<TwoFactorSetup> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secret, qrCodeDataUrl, otpauthUrl };
  },

  verifyTotp(secret: string, token: string): boolean {
    try {
      return authenticator.check(token, secret);
    } catch {
      return false;
    }
  },

  /** Confirma o setup (secret ainda não persistido) e ativa o 2FA, retornando os códigos de recuperação em texto plano (mostrados uma única vez). */
  async enable(userId: string, secret: string, token: string): Promise<string[]> {
    if (!this.verifyTotp(secret, token)) {
      throw new Error("Código de verificação inválido.");
    }

    const recoveryCodes = generateRecoveryCodes();
    const hashedCodes = await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 10)));
    const encryptedSecret = encryptSecret(secret);

    await userRepository.setTwoFactorSecret(userId, encryptedSecret, hashedCodes);
    return recoveryCodes;
  },

  async disable(userId: string): Promise<void> {
    await userRepository.disableTwoFactor(userId);
  },

  verifyLogin(encryptedSecret: string, token: string): boolean {
    const secret = decryptSecret(encryptedSecret);
    return this.verifyTotp(secret, token);
  },

  async verifyRecoveryCode(
    userId: string,
    hashedCodes: string[],
    inputCode: string,
  ): Promise<boolean> {
    for (const hashed of hashedCodes) {
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(inputCode.toUpperCase(), hashed)) {
        const remaining = hashedCodes.filter((code) => code !== hashed);
        await userRepository.consumeRecoveryCode(userId, remaining);
        return true;
      }
    }
    return false;
  },
};

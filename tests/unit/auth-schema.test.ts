import { describe, expect, it } from "vitest";
import {
  registerSchema,
  resetPasswordSchema,
  resetPasswordFormSchema,
} from "@/schemas/auth.schema";
import { changePasswordSchema } from "@/schemas/account.schema";

const STRONG = "Sup3rSenh@Forte";
const OTHER_STRONG = "Outr@Senh4Boa";

describe("registerSchema", () => {
  it("aceita cadastro com senhas iguais", () => {
    const result = registerSchema.safeParse({
      name: "Rafael Vieira",
      email: "Rafael@Exemplo.com",
      password: STRONG,
      confirmPassword: STRONG,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("rafael@exemplo.com");
  });

  it("rejeita quando a confirmação não confere", () => {
    const result = registerSchema.safeParse({
      name: "Rafael Vieira",
      email: "rafael@exemplo.com",
      password: STRONG,
      confirmPassword: OTHER_STRONG,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(["confirmPassword"]);
      expect(result.error.issues[0]!.message).toContain("não coincidem");
    }
  });

  it("rejeita senha fraca mesmo com confirmação igual", () => {
    const result = registerSchema.safeParse({
      name: "Rafael Vieira",
      email: "rafael@exemplo.com",
      password: "senhafraca",
      confirmPassword: "senhafraca",
    });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("aceita reset com confirmação igual", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "abc",
        password: STRONG,
        confirmPassword: STRONG,
      }).success,
    ).toBe(true);
  });

  it("rejeita confirmação divergente", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "abc",
        password: STRONG,
        confirmPassword: OTHER_STRONG,
      }).success,
    ).toBe(false);
  });

  it("formulário valida sem exigir o token (que vem da URL)", () => {
    expect(
      resetPasswordFormSchema.safeParse({ password: STRONG, confirmPassword: STRONG }).success,
    ).toBe(true);
  });
});

describe("changePasswordSchema", () => {
  it("aceita troca válida", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "AntigaSenh@1",
        newPassword: STRONG,
        confirmPassword: STRONG,
      }).success,
    ).toBe(true);
  });

  it("rejeita nova senha igual à atual", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: STRONG,
      newPassword: STRONG,
      confirmPassword: STRONG,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toContain("diferente da senha atual");
    }
  });

  it("rejeita confirmação divergente", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "AntigaSenh@1",
        newPassword: STRONG,
        confirmPassword: OTHER_STRONG,
      }).success,
    ).toBe(false);
  });
});

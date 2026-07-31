import { describe, expect, it } from "vitest";
import { loginSchema } from "@/schemas/auth.schema";

const BASE = { email: "rafael@exemplo.com", password: "SenhaForte@1" };

describe("loginSchema", () => {
  it("aceita login sem 2FA", () => {
    const result = loginSchema.safeParse(BASE);
    expect(result.success).toBe(true);
  });

  /**
   * Regressão: o signIn do Auth.js monta o corpo com URLSearchParams, o que transforma
   * `undefined` na string "undefined". Sem tratar isso, todo login sem 2FA era recusado
   * antes de chegar na autenticação.
   */
  it('trata a string "undefined" como campo ausente', () => {
    const result = loginSchema.safeParse({
      ...BASE,
      totpCode: "undefined",
      recoveryCode: "undefined",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totpCode).toBeUndefined();
      expect(result.data.recoveryCode).toBeUndefined();
    }
  });

  it("trata string vazia e null como campo ausente", () => {
    expect(loginSchema.safeParse({ ...BASE, totpCode: "" }).success).toBe(true);
    expect(loginSchema.safeParse({ ...BASE, totpCode: null }).success).toBe(true);
  });

  it("aceita código 2FA de 6 dígitos", () => {
    const result = loginSchema.safeParse({ ...BASE, totpCode: "123456" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.totpCode).toBe("123456");
  });

  it("rejeita código 2FA com tamanho inválido", () => {
    expect(loginSchema.safeParse({ ...BASE, totpCode: "12345" }).success).toBe(false);
    expect(loginSchema.safeParse({ ...BASE, totpCode: "1234567" }).success).toBe(false);
  });

  it("normaliza o e-mail para minúsculas", () => {
    const result = loginSchema.safeParse({ ...BASE, email: "  Rafael@Exemplo.COM  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("rafael@exemplo.com");
  });

  it("rejeita senha vazia", () => {
    expect(loginSchema.safeParse({ ...BASE, password: "" }).success).toBe(false);
  });
});

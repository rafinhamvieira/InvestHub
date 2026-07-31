import { describe, expect, it } from "vitest";
import { checkPasswordStrength } from "@/validators/password.validator";

describe("checkPasswordStrength", () => {
  it("rejeita senhas curtas", () => {
    expect(checkPasswordStrength("Ab1!").valid).toBe(false);
  });

  it("rejeita senhas sem símbolo", () => {
    expect(checkPasswordStrength("Abcdefgh12").valid).toBe(false);
  });

  it("aceita senha forte", () => {
    expect(checkPasswordStrength("Sup3rSenh@Forte").valid).toBe(true);
  });
});

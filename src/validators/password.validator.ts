const MIN_LENGTH = 10;

export interface PasswordStrengthResult {
  valid: boolean;
  errors: string[];
}

/**
 * Política de senha: mínimo 10 caracteres, ao menos uma maiúscula, uma minúscula,
 * um número e um símbolo. Usada tanto no schema Zod quanto em validações server-side extras.
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];

  if (password.length < MIN_LENGTH) {
    errors.push(`A senha deve ter no mínimo ${MIN_LENGTH} caracteres.`);
  }
  if (!/[a-z]/.test(password)) errors.push("A senha deve conter uma letra minúscula.");
  if (!/[A-Z]/.test(password)) errors.push("A senha deve conter uma letra maiúscula.");
  if (!/[0-9]/.test(password)) errors.push("A senha deve conter um número.");
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("A senha deve conter um símbolo.");

  return { valid: errors.length === 0, errors };
}

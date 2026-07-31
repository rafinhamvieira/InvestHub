import { z } from "zod";
import { checkPasswordStrength } from "@/validators/password.validator";
import { isReservedName, RESERVED_NAME_MESSAGE } from "@/validators/reserved-name.validator";

/** Nome de exibição: mínimo dois caracteres e sem termos reservados à administração. */
export const displayNameField = z
  .string()
  .trim()
  .min(2, "Informe seu nome completo.")
  .max(120)
  .refine((value) => !isReservedName(value), { message: RESERVED_NAME_MESSAGE });

const passwordField = z
  .string()
  .min(10, "A senha deve ter no mínimo 10 caracteres.")
  .refine((value) => checkPasswordStrength(value).valid, {
    message: "A senha deve conter maiúscula, minúscula, número e símbolo.",
  });

export const registerSchema = z
  .object({
    name: displayNameField,
    email: z.string().trim().toLowerCase().email("E-mail inválido."),
    password: passwordField,
    confirmPassword: z.string().min(1, "Repita a senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * O signIn do Auth.js monta o corpo com `new URLSearchParams({...options})`, e isso
 * converte `undefined` na string literal "undefined". Sem normalizar, um campo opcional
 * não preenchido reprovaria a validação e o login falharia antes mesmo de ser avaliado.
 */
const absentAsUndefined = (value: unknown) =>
  value === "undefined" || value === "null" || value === "" || value === null ? undefined : value;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(1, "Informe sua senha."),
  totpCode: z.preprocess(absentAsUndefined, z.string().length(6).optional()),
  recoveryCode: z.preprocess(absentAsUndefined, z.string().min(1).optional()),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Token inválido."),
    password: passwordField,
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Mesmas regras do reset, sem o token — que vem da URL, não do formulário.
 * Schemas com .refine() não aceitam .omit(), por isso a definição separada.
 */
export const resetPasswordFormSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token inválido."),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const enableTwoFactorSchema = z.object({
  secret: z.string().min(1),
  token: z.string().length(6),
});
export type EnableTwoFactorInput = z.infer<typeof enableTwoFactorSchema>;

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1),
});
export type DisableTwoFactorInput = z.infer<typeof disableTwoFactorSchema>;

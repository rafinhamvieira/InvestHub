import { z } from "zod";
import { checkPasswordStrength } from "@/validators/password.validator";

const passwordField = z
  .string()
  .min(10, "A senha deve ter no mínimo 10 caracteres.")
  .refine((value) => checkPasswordStrength(value).valid, {
    message: "A senha deve conter maiúscula, minúscula, número e símbolo.",
  });

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: passwordField,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(1, "Informe sua senha."),
  totpCode: z.string().length(6).optional(),
  recoveryCode: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token inválido."),
  password: passwordField,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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

import { z } from "zod";
import { checkPasswordStrength } from "@/validators/password.validator";

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  riskProfile: z.enum(["CONSERVATIVE", "MODERATE", "AGGRESSIVE", "CUSTOM"]),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const preferencesSchema = z.object({
  currency: z.enum(["BRL", "USD"]),
  theme: z.enum(["light", "dark", "system"]),
  locale: z.enum(["pt-BR", "en-US"]),
  emailNotifications: z.boolean(),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: z
    .string()
    .min(10, "A nova senha deve ter no mínimo 10 caracteres.")
    .refine((value) => checkPasswordStrength(value).valid, {
      message: "A nova senha deve conter maiúscula, minúscula, número e símbolo.",
    }),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

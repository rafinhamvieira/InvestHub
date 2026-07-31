"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const credentialsSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "Informe sua senha."),
});
type CredentialsValues = z.infer<typeof credentialsSchema>;

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
  ACCOUNT_LOCKED: "Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.",
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  INVALID_TWO_FACTOR_CODE: "Código de autenticação inválido.",
  RATE_LIMITED: "Muitas tentativas. Aguarde um momento antes de tentar novamente.",
  UNKNOWN_ERROR: "Não foi possível entrar. Tente novamente.",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CredentialsValues>({ resolver: zodResolver(credentialsSchema) });

  async function attemptSignIn(values: CredentialsValues, code?: string) {
    setIsSubmitting(true);
    setFormError(null);

    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      totpCode: code,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      if (result.error === "TWO_FACTOR_REQUIRED") {
        setRequiresTwoFactor(true);
        return;
      }
      setFormError(ERROR_MESSAGES[result.error] ?? "Não foi possível entrar. Tente novamente.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  const onSubmitCredentials = handleSubmit((values) => attemptSignIn(values));

  async function onSubmitTwoFactor() {
    await attemptSignIn(getValues(), totpCode);
  }

  if (requiresTwoFactor) {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight">Verificação em duas etapas</h2>
          <p className="text-sm text-muted-foreground">
            Digite o código de 6 dígitos do seu aplicativo autenticador.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="totpCode">Código de verificação</Label>
          <Input
            id="totpCode"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
          />
        </div>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <Button className="w-full" disabled={isSubmitting || totpCode.length !== 6} onClick={onSubmitTwoFactor}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Verificar
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={onSubmitCredentials} noValidate>
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
        <p className="text-sm text-muted-foreground">Acesse sua conta InvestHub.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Senha</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
            Esqueceu a senha?
          </Link>
        </div>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Entrar
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Não tem uma conta?{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}

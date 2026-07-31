"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  resetPasswordFormSchema,
  type ResetPasswordFormInput,
} from "@/schemas/auth.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = ResetPasswordFormInput;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(resetPasswordFormSchema) });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    setFormError(null);

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...values }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setFormError(
        data?.error === "SAME_PASSWORD"
          ? "A nova senha precisa ser diferente da senha atual."
          : "Link inválido ou expirado. Solicite um novo.",
      );
      return;
    }

    router.push("/login");
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-destructive">Link inválido.</p>
        <Link href="/forgot-password" className="text-sm font-medium hover:underline">
          Solicitar novo link
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">Nova senha</h2>
        <p className="text-sm text-muted-foreground">Escolha uma nova senha para sua conta.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        <p className="text-xs text-muted-foreground">
          Mínimo 10 caracteres, com maiúscula, minúscula, número e símbolo.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Repita a nova senha</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Redefinir senha
      </Button>
    </form>
  );
}

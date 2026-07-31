"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

type Status = "loading" | "success" | "error";

export function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => setStatus(res.ok ? "success" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "loading") {
    return (
      <div className="space-y-4 text-center">
        <Loader2 className="mx-auto size-10 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Confirmando seu e-mail...</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h2 className="text-xl font-semibold">E-mail confirmado</h2>
        <p className="text-sm text-muted-foreground">Sua conta está ativa. Você já pode entrar.</p>
        <Link href="/login" className="text-sm font-medium text-foreground hover:underline">
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <XCircle className="mx-auto size-10 text-destructive" />
      <h2 className="text-xl font-semibold">Link inválido ou expirado</h2>
      <p className="text-sm text-muted-foreground">Solicite um novo cadastro ou reenvio de confirmação.</p>
      <Link href="/login" className="text-sm font-medium text-foreground hover:underline">
        Voltar para o login
      </Link>
    </div>
  );
}

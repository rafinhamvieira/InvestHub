"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Step = "idle" | "scanning" | "codes";

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [token, setToken] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function startSetup() {
    setIsLoading(true);
    const response = await fetch("/api/account/two-factor/setup", { method: "POST" });
    setIsLoading(false);

    if (!response.ok) {
      toast.error("Não foi possível iniciar a configuração.");
      return;
    }

    const data = await response.json();
    setSecret(data.secret);
    setQrCode(data.qrCodeDataUrl);
    setStep("scanning");
  }

  async function confirmSetup() {
    setIsLoading(true);
    const response = await fetch("/api/account/two-factor/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, token }),
    });
    setIsLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(data?.error ?? "Código inválido. Tente novamente.");
      return;
    }

    const data = await response.json();
    setRecoveryCodes(data.recoveryCodes);
    setToken("");
    setStep("codes");
    router.refresh();
  }

  async function disable() {
    setIsLoading(true);
    const response = await fetch("/api/account/two-factor/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setIsLoading(false);

    if (!response.ok) {
      toast.error("Senha incorreta.");
      return;
    }

    setPassword("");
    setDisableOpen(false);
    toast.success("Autenticação em duas etapas desativada.");
    router.refresh();
  }

  function copyRecoveryCodes() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast.success("Códigos copiados.");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Autenticação em duas etapas</CardTitle>
          <Badge variant={enabled ? "success" : "secondary"}>
            {enabled ? "Ativa" : "Inativa"}
          </Badge>
        </div>
        <CardDescription>
          Exige um código do seu aplicativo autenticador além da senha ao entrar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled ? (
          <Button variant="outline" onClick={() => setDisableOpen(true)}>
            <ShieldOff />
            Desativar 2FA
          </Button>
        ) : step === "idle" ? (
          <Button onClick={startSetup} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Ativar 2FA
          </Button>
        ) : step === "scanning" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escaneie o QR Code com Google Authenticator, Authy ou similar e digite o código de 6
              dígitos gerado.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCode}
                alt="QR Code para configurar a autenticação em duas etapas"
                className="size-40 rounded-lg border bg-white p-2"
              />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Ou digite a chave manualmente:</p>
                <code className="block rounded bg-muted px-2 py-1 text-xs">{secret}</code>
              </div>
            </div>
            <div className="flex max-w-xs items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="totp-token">Código de verificação</Label>
                <Input
                  id="totp-token"
                  inputMode="numeric"
                  maxLength={6}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <Button onClick={confirmSetup} disabled={isLoading || token.length !== 6}>
                {isLoading && <Loader2 className="animate-spin" />}
                Confirmar
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep("idle")}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-success">2FA ativada com sucesso.</p>
            <p className="text-sm text-muted-foreground">
              Guarde estes códigos de recuperação em local seguro. Eles permitem entrar caso você
              perca acesso ao aplicativo — <strong>não serão exibidos novamente</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4">
              {recoveryCodes.map((code) => (
                <code key={code} className="text-center text-sm tabular-nums">
                  {code}
                </code>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyRecoveryCodes}>
                <Copy />
                Copiar códigos
              </Button>
              <Button size="sm" onClick={() => setStep("idle")}>
                Concluir
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desativar 2FA</DialogTitle>
            <DialogDescription>
              Confirme sua senha. Sua conta ficará protegida apenas pela senha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="disable-password">Senha</Label>
            <Input
              id="disable-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={disable} disabled={isLoading || !password}>
              {isLoading && <Loader2 className="animate-spin" />}
              Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

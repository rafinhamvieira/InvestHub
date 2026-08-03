"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmação de identidade do administrador — o "sudo" do painel.
 *
 * Aparece quando a API responde que a confirmação expirou, e não antes: pedir a senha na
 * abertura de cada ação treinaria o administrador a digitá-la por reflexo, que é justamente
 * o hábito que um ataque de phishing explora. A confirmação vale por alguns minutos, então
 * uma sequência de ações pede a senha uma vez só.
 *
 * A senha vive apenas no estado deste componente e é apagada ao fechar. Quem guarda a
 * confirmação é o servidor, no Redis, nunca o token nem o navegador.
 */
export function StepUpDialog({
  open,
  onOpenChange,
  onConfirmed,
  twoFactorEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após o servidor aceitar — a tela reenvia a ação que estava pendente. */
  onConfirmed: () => void;
  twoFactorEnabled: boolean;
}) {
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function close() {
    setPassword("");
    setTotpCode("");
    onOpenChange(false);
  }

  async function confirm() {
    setIsSubmitting(true);

    const response = await fetch("/api/admin/step-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        ...(twoFactorEnabled ? { totpCode: totpCode.trim() } : {}),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível confirmar sua identidade."));
      return;
    }

    const { expiresInSeconds } = (await response.json()) as { expiresInSeconds: number };

    close();
    toast.success(`Identidade confirmada por ${Math.round(expiresInSeconds / 60)} minutos.`);
    onConfirmed();
  }

  const podeConfirmar =
    password.length > 0 && (!twoFactorEnabled || totpCode.trim().length >= 6) && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-warning" />
            Confirme sua identidade
          </DialogTitle>
          <DialogDescription>
            Esta ação altera a conta de outra pessoa. Um token roubado dá leitura; sem a sua
            senha, não dá poder de agir.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (podeConfirmar) void confirm();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="step-up-password">Sua senha</Label>
            <Input
              id="step-up-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {twoFactorEnabled && (
            <div className="space-y-2">
              <Label htmlFor="step-up-totp">Código do aplicativo</Label>
              <Input
                id="step-up-totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="000000"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
              />
            </div>
          )}

          {/* O botão fica dentro do form para o Enter valer; o rodapé só o posiciona. */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!podeConfirmar}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

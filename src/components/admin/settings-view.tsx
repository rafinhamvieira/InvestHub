"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { extractApiError } from "@/utils/api-error";
import type { ResolvedSetting } from "@/services/platform-settings.service";
import { StepUpDialog } from "@/components/admin/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const REASON_MIN_LENGTH = 10;

type Pending =
  | { kind: "SET"; setting: ResolvedSetting; value: number }
  | { kind: "RESET"; setting: ResolvedSetting };

export function SettingsView({
  initial,
  adminTwoFactorEnabled,
}: {
  initial: ResolvedSetting[];
  adminTwoFactorEnabled: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsStepUp, setNeedsStepUp] = useState(false);

  function draftOf(setting: ResolvedSetting): string {
    return drafts[setting.key] ?? String(setting.value);
  }

  async function confirm() {
    if (!pending) return;
    setIsSubmitting(true);

    const body =
      pending.kind === "SET"
        ? { action: "SET", key: pending.setting.key, value: pending.value, reason: reason.trim() }
        : { action: "RESET", key: pending.setting.key, reason: reason.trim() };

    const response = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setIsSubmitting(false);

    if (response.status === 428) {
      setNeedsStepUp(true);
      return;
    }

    if (!response.ok) {
      toast.error(await extractApiError(response, "Não foi possível salvar."));
      return;
    }

    const data: { settings: ResolvedSetting[] } = await response.json();
    setSettings(data.settings);
    setDrafts({});
    setPending(null);
    setReason("");
    toast.success("Parâmetro alterado. Vale no próximo ciclo, sem reiniciar nada.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Parâmetros de operação que valem sem recriar container. Cada alteração exige
          confirmação de senha e justificativa, e fica na trilha de auditoria com o valor
          anterior.
        </p>
      </div>

      <Card>
        <CardContent className="flex gap-3 p-4">
          <SlidersHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Segredos e endereços de conexão continuam só no <code className="rounded bg-muted px-1">.env</code>,
            onde uma edição errada não chega pela internet. O intervalo do agendador e a
            retenção do backup também não estão aqui: eles pertencem a <strong>outros
            containers</strong>, que a aplicação não consegue reconfigurar — mudá-los continua
            sendo editar o <code className="rounded bg-muted px-1">.env</code> e subir de novo.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {settings.map((setting) => {
          const draft = draftOf(setting);
          const parsed = Number(draft);
          const changed = draft !== String(setting.value);
          const valid = Number.isInteger(parsed) && parsed >= setting.min && parsed <= setting.max;

          return (
            <Card key={setting.key}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-72 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{setting.label}</p>
                    {setting.isDefault ? (
                      <Badge variant="secondary">padrão</Badge>
                    ) : (
                      <Badge variant="warning">definido no painel</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{setting.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Aceita de {setting.min} a {setting.max} {setting.unit} · padrão{" "}
                    {setting.fallback}
                    {setting.updatedAt &&
                      ` · alterado em ${new Date(setting.updatedAt).toLocaleString("pt-BR")}`}
                  </p>
                </div>

                <div className="flex items-end gap-2">
                  <div className="w-32 space-y-2">
                    <Label htmlFor={`setting-${setting.key}`} className="text-xs">
                      {setting.unit}
                    </Label>
                    <Input
                      id={`setting-${setting.key}`}
                      inputMode="numeric"
                      value={draft}
                      onChange={(event) =>
                        setDrafts({ ...drafts, [setting.key]: event.target.value })
                      }
                    />
                  </div>

                  <Button
                    size="sm"
                    disabled={!changed || !valid}
                    onClick={() => {
                      setPending({ kind: "SET", setting, value: parsed });
                      setReason("");
                    }}
                  >
                    <Save className="size-4" />
                    Salvar
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    title="Voltar ao padrão"
                    disabled={setting.isDefault}
                    onClick={() => {
                      setPending({ kind: "RESET", setting });
                      setReason("");
                    }}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={pending !== null && !needsStepUp}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {pending.kind === "SET" ? "Alterar parâmetro" : "Voltar ao padrão"}
                </DialogTitle>
                <DialogDescription>
                  {pending.setting.label}:{" "}
                  {pending.kind === "SET"
                    ? `${pending.setting.value} → ${pending.value} ${pending.setting.unit}`
                    : `${pending.setting.value} → ${pending.setting.fallback} ${pending.setting.unit} (padrão)`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="setting-reason">Motivo</Label>
                <Textarea
                  id="setting-reason"
                  rows={3}
                  placeholder="Ex: assinei o plano pago do provedor de fundamentos."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Fica na trilha junto com o valor anterior, seu nome e o horário.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPending(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={confirm}
                  disabled={isSubmitting || reason.trim().length < REASON_MIN_LENGTH}
                >
                  {isSubmitting && <Loader2 className="animate-spin" />}
                  Confirmar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <StepUpDialog
        open={needsStepUp}
        onOpenChange={setNeedsStepUp}
        twoFactorEnabled={adminTwoFactorEnabled}
        onConfirmed={confirm}
      />
    </div>
  );
}

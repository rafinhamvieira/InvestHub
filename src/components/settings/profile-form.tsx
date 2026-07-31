"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const RISK_PROFILES = [
  { value: "CONSERVATIVE", label: "Conservador", description: "Prioriza preservação de capital e renda estável." },
  { value: "MODERATE", label: "Moderado", description: "Equilíbrio entre segurança e crescimento." },
  { value: "AGGRESSIVE", label: "Agressivo", description: "Aceita volatilidade em troca de maior retorno." },
  { value: "CUSTOM", label: "Personalizado", description: "Você define suas próprias regras e pesos." },
] as const;

interface ProfileFormProps {
  initialName: string;
  email: string;
  initialRiskProfile: string;
}

export function ProfileForm({ initialName, email, initialRiskProfile }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [riskProfile, setRiskProfile] = useState(initialRiskProfile);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, riskProfile }),
    });
    setIsSaving(false);

    if (!response.ok) {
      toast.error("Não foi possível salvar o perfil.");
      return;
    }
    toast.success("Perfil atualizado.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Perfil</CardTitle>
        <CardDescription>Seus dados e seu perfil de investidor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Nome</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={email} disabled />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Perfil de investidor</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {RISK_PROFILES.map((profile) => (
              <button
                key={profile.value}
                type="button"
                onClick={() => setRiskProfile(profile.value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                  riskProfile === profile.value && "border-primary bg-primary/5",
                )}
              >
                <p className="text-sm font-medium">{profile.label}</p>
                <p className="text-xs text-muted-foreground">{profile.description}</p>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={save} disabled={isSaving || name.trim().length < 2}>
          {isSaving && <Loader2 className="animate-spin" />}
          Salvar perfil
        </Button>
      </CardContent>
    </Card>
  );
}

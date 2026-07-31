"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PreferencesFormProps {
  initialCurrency: string;
  initialTheme: string;
  initialLocale: string;
  initialEmailNotifications: boolean;
}

export function PreferencesForm({
  initialCurrency,
  initialTheme,
  initialLocale,
  initialEmailNotifications,
}: PreferencesFormProps) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [currency, setCurrency] = useState(initialCurrency);
  const [theme, setThemeValue] = useState(initialTheme);
  const [locale, setLocale] = useState(initialLocale);
  const [emailNotifications, setEmailNotifications] = useState(initialEmailNotifications);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);
    const response = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency, theme, locale, emailNotifications }),
    });
    setIsSaving(false);

    if (!response.ok) {
      toast.error("Não foi possível salvar as preferências.");
      return;
    }

    // Aplica o tema escolhido imediatamente, além de persistir na conta.
    setTheme(theme);
    toast.success("Preferências salvas.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Preferências</CardTitle>
        <CardDescription>Moeda, aparência, idioma e notificações.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Moeda</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">Real (R$)</SelectItem>
                <SelectItem value="USD">Dólar (US$)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tema</Label>
            <Select value={theme} onValueChange={setThemeValue}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Idioma</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Notificações por e-mail</span>
            <span className="block text-xs text-muted-foreground">
              Receber alertas de preço e proventos também por e-mail.
            </span>
          </span>
          <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
        </label>

        <Button onClick={save} disabled={isSaving}>
          {isSaving && <Loader2 className="animate-spin" />}
          Salvar preferências
        </Button>
      </CardContent>
    </Card>
  );
}

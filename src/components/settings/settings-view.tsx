"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/settings/profile-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { PasswordCard } from "@/components/settings/password-card";
import { TwoFactorCard } from "@/components/settings/two-factor-card";
import { LoginHistoryCard } from "@/components/settings/login-history-card";
import type { AccountOverview } from "@/services/account.service";

export function SettingsView({ account }: { account: AccountOverview }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Perfil, preferências e segurança da conta.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="preferences">Preferências</TabsTrigger>
          <TabsTrigger value="security">Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileForm
            initialName={account.name ?? ""}
            email={account.email}
            initialRiskProfile={account.riskProfile}
          />
        </TabsContent>

        <TabsContent value="preferences">
          <PreferencesForm
            initialCurrency={account.currency}
            initialTheme={account.theme}
            initialLocale={account.locale}
            initialEmailNotifications={account.emailNotifications}
          />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <PasswordCard />
          <TwoFactorCard enabled={account.twoFactorEnabled} />
          <LoginHistoryCard history={account.loginHistory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

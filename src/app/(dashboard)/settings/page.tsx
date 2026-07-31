import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { accountService } from "@/services/account.service";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const session = await auth();
  const account = await accountService.getOverview(session!.user.id);

  return <SettingsView account={account} />;
}

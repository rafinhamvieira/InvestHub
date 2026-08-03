import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePermission, AuthorizationError } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { platformSettingsService } from "@/services/platform-settings.service";
import { SettingsView } from "@/components/admin/settings-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Configurações" };

export default async function AdminSettingsPage() {
  let admin;
  try {
    admin = await requirePermission(Permission.MANAGE_PLATFORM);
  } catch (error) {
    redirect(
      error instanceof AuthorizationError && error.code === "UNAUTHORIZED" ? "/login" : "/admin",
    );
  }

  return (
    <SettingsView
      initial={await platformSettingsService.all()}
      adminTwoFactorEnabled={admin.twoFactorEnabled}
    />
  );
}

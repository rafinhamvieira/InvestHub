import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePermission, AuthorizationError } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminMonitoringService } from "@/services/admin-monitoring.service";
import { MonitoringView } from "@/components/admin/monitoring-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Monitoramento" };

export default async function AdminMonitoringPage() {
  try {
    await requirePermission(Permission.VIEW_SYSTEM_HEALTH);
  } catch (error) {
    redirect(
      error instanceof AuthorizationError && error.code === "UNAUTHORIZED" ? "/login" : "/admin",
    );
  }

  return <MonitoringView initial={await adminMonitoringService.series("24h")} />;
}

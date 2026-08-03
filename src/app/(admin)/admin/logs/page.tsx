import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePermission, AuthorizationError } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminLogService } from "@/services/admin-log.service";
import { LogsView } from "@/components/admin/logs-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Logs" };

export default async function AdminLogsPage() {
  try {
    await requirePermission(Permission.VIEW_APPLICATION_LOGS);
  } catch (error) {
    redirect(
      error instanceof AuthorizationError && error.code === "UNAUTHORIZED" ? "/login" : "/admin",
    );
  }

  const initial = await adminLogService.list({ page: 1, pageSize: 50 });

  return <LogsView initial={initial} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePermission, AuthorizationError } from "@/lib/auth-guard";
import { can, Permission } from "@/lib/permissions";
import { adminHealthService } from "@/services/admin-health.service";
import { adminMetricsService } from "@/services/admin-metrics.service";
import { AdminDashboardView } from "@/components/admin/admin-dashboard-view";

// Números do banco e sondagens de infraestrutura: nada disso pode ser pré-renderizado.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Painel" };

/**
 * A primeira renderização vem do servidor para que o painel abra com os números já na tela;
 * dali em diante quem atualiza é a própria view, pela rota da API.
 */
export default async function AdminDashboardPage() {
  let admin;
  try {
    admin = await requirePermission(Permission.VIEW_SYSTEM_HEALTH);
  } catch (error) {
    redirect(error instanceof AuthorizationError && error.code === "UNAUTHORIZED" ? "/login" : "/dashboard");
  }

  const [health, metrics] = await Promise.all([
    adminHealthService.summary(),
    can(admin, Permission.VIEW_BUSINESS_METRICS) ? adminMetricsService.summary() : null,
  ]);

  return <AdminDashboardView initial={{ health, metrics }} />;
}

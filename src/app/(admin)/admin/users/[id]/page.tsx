import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requirePermission, AuthorizationError } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminUserService, AdminActionError } from "@/services/admin-user.service";
import { UserDetailView } from "@/components/admin/user-detail-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Conta" };

/**
 * Detalhe de uma conta: identidade, sessões, acessos e o que já foi feito sobre ela.
 *
 * A permissão é conferida aqui além do layout — o layout só exige `VIEW_AUDIT`, que todo
 * cargo administrativo tem, e esta tela mostra a atividade de uma pessoa específica.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let admin;
  try {
    admin = await requirePermission(Permission.MANAGE_USERS);
  } catch (error) {
    redirect(
      error instanceof AuthorizationError && error.code === "UNAUTHORIZED" ? "/login" : "/admin",
    );
  }

  const { id } = await params;

  try {
    const detail = await adminUserService.detail(id);

    return (
      <UserDetailView
        detail={detail}
        currentAdminId={admin.id}
        adminTwoFactorEnabled={admin.twoFactorEnabled}
      />
    );
  } catch (error) {
    if (error instanceof AdminActionError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePermission, AuthorizationError } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminUserService } from "@/services/admin-user.service";
import { RolesView } from "@/components/admin/roles-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cargos" };

/**
 * A matriz é documentação do próprio sistema, não dado sensível: qualquer cargo
 * administrativo pode consultá-la. Quem **altera** cargo precisa de `MANAGE_ROLES`, e essa
 * ação vive na tela de usuários.
 */
export default async function AdminRolesPage() {
  try {
    await requirePermission(Permission.VIEW_AUDIT);
  } catch (error) {
    redirect(
      error instanceof AuthorizationError && error.code === "UNAUTHORIZED" ? "/login" : "/admin",
    );
  }

  return <RolesView counts={await adminUserService.roleCounts()} />;
}

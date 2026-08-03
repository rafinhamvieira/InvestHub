import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth-guard";
import { Permission } from "@/lib/permissions";
import { adminUserService } from "@/services/admin-user.service";
import { UsersView } from "@/components/admin/users-view";

// Sempre renderizada por requisição: os dados vêm do banco e a permissão é conferida no
// layout. Sem isto o Next tenta pré-renderizar no build, onde não há banco nem sessão.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Usuários" };

export default async function AdminUsersPage() {
  // O layout já barrou quem não é administrador; aqui só precisamos de quem é, para a tela
  // saber qual linha é a do próprio usuário e desabilitar o autorrebaixamento.
  const [admin, initial] = await Promise.all([
    requirePermission(Permission.MANAGE_USERS),
    adminUserService.list({ page: 1, pageSize: 50 }),
  ]);

  return (
    <UsersView
      initial={initial}
      currentAdminId={admin.id}
      adminTwoFactorEnabled={admin.twoFactorEnabled}
    />
  );
}

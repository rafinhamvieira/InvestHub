import type { Metadata } from "next";
import { adminUserService } from "@/services/admin-user.service";
import { UsersView } from "@/components/admin/users-view";

// Sempre renderizada por requisição: os dados vêm do banco e a permissão é conferida no
// layout. Sem isto o Next tenta pré-renderizar no build, onde não há banco nem sessão.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Usuários" };

export default async function AdminUsersPage() {
  const initial = await adminUserService.list({ page: 1, pageSize: 50 });

  return <UsersView initial={initial} />;
}

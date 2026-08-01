import type { Metadata } from "next";
import { adminUserService } from "@/services/admin-user.service";
import { UsersView } from "@/components/admin/users-view";

export const metadata: Metadata = { title: "Usuários" };

export default async function AdminUsersPage() {
  const initial = await adminUserService.list({ page: 1, pageSize: 50 });

  return <UsersView initial={initial} />;
}

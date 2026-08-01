import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminAccessError, requireAdmin } from "@/lib/admin-guard";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Topbar } from "@/components/layout/topbar";

export const metadata: Metadata = { title: "Administração" };

/**
 * Segunda barreira do painel: o middleware já barrou pelo token, aqui o papel é conferido
 * no banco. Vale para todas as páginas abaixo de `/admin`, inclusive as que alguém
 * adicionar depois sem lembrar de proteger.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    redirect(error instanceof AdminAccessError && error.code === "UNAUTHORIZED" ? "/login" : "/dashboard");
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <Topbar user={{ name: admin.name, email: admin.email, image: null }} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}

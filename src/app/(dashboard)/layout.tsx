import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { currentPrincipal } from "@/lib/auth-guard";
import { hasAdminAccess } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const user = session!.user;
  const admin = hasAdminAccess(await currentPrincipal());

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={admin} />
      <div className="flex flex-1 flex-col">
        <Topbar user={{ name: user.name ?? null, email: user.email ?? "", image: user.image ?? null }} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}

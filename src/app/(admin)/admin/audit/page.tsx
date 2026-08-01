import type { Metadata } from "next";
import { adminAuditService } from "@/services/admin-audit.service";
import { AuditView } from "@/components/admin/audit-view";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AdminAuditPage() {
  // O layout já garantiu o papel de administrador antes desta página existir.
  const initial = await adminAuditService.list({ page: 1, pageSize: 50 });

  return <AuditView initial={initial} />;
}

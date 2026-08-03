import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth-guard";
import { Permission, can } from "@/lib/permissions";
import { auditService } from "@/services/audit.service";
import { AuditView } from "@/components/admin/audit-view";

// Sempre renderizada por requisição: os dados vêm do banco e a permissão é conferida aqui.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AdminAuditPage() {
  const admin = await requirePermission(Permission.VIEW_AUDIT);
  const initial = await auditService.list({ pageSize: 50 });

  return (
    <AuditView
      initial={initial}
      canVerifyIntegrity={can(admin, Permission.VERIFY_AUDIT_INTEGRITY)}
    />
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePermission, AuthorizationError } from "@/lib/auth-guard";
import { can, Permission } from "@/lib/permissions";
import { adminBackupService } from "@/services/admin-backup.service";
import { BackupView } from "@/components/admin/backup-view";

// Sempre renderizada por requisição: os dados vêm do banco e a permissão é conferida no
// layout. Sem isto o Next tenta pré-renderizar no build, onde não há banco nem sessão.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Backup" };

/**
 * A permissão é conferida aqui, e não só na API.
 *
 * O layout exige apenas `VIEW_AUDIT`, que todo cargo administrativo tem — sem esta guarda,
 * auditoria e suporte abriam a tela e liam nomes, tamanhos e horários dos dumps. Não é o
 * conteúdo do banco, mas é o inventário de onde ele está, e não é assunto deles.
 */
export default async function AdminBackupPage() {
  let admin;
  try {
    admin = await requirePermission(Permission.MANAGE_BACKUPS);
  } catch (error) {
    redirect(
      error instanceof AuthorizationError && error.code === "UNAUTHORIZED" ? "/login" : "/admin",
    );
  }

  const files = await adminBackupService.list();

  return (
    <BackupView
      initial={files}
      canRestore={can(admin, Permission.RESTORE_BACKUP)}
      adminTwoFactorEnabled={admin.twoFactorEnabled}
    />
  );
}

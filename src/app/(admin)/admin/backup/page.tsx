import type { Metadata } from "next";
import { adminBackupService } from "@/services/admin-backup.service";
import { BackupView } from "@/components/admin/backup-view";

// Sempre renderizada por requisição: os dados vêm do banco e a permissão é conferida no
// layout. Sem isto o Next tenta pré-renderizar no build, onde não há banco nem sessão.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Backup" };

export default async function AdminBackupPage() {
  const files = await adminBackupService.list();

  return <BackupView initial={files} />;
}

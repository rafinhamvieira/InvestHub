import type { Metadata } from "next";
import { adminBackupService } from "@/services/admin-backup.service";
import { BackupView } from "@/components/admin/backup-view";

export const metadata: Metadata = { title: "Backup" };

export default async function AdminBackupPage() {
  const files = await adminBackupService.list();

  return <BackupView initial={files} />;
}

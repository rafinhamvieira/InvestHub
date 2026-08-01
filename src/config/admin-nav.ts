import type { LucideIcon } from "lucide-react";
import { ScrollText, Users, DatabaseBackup } from "lucide-react";

export interface AdminNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

/**
 * Navegação do painel administrativo.
 *
 * Separada de `nav.ts` de propósito: são dois produtos com públicos diferentes, e misturar
 * os menus é o primeiro passo para alguém acabar exibindo item de admin para usuário comum.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  {
    title: "Auditoria",
    href: "/admin/audit",
    icon: ScrollText,
    description: "Acessos, senhas e ações sensíveis de toda a plataforma",
  },
  {
    title: "Usuários",
    href: "/admin/users",
    icon: Users,
    description: "Cadastro, permissões e ações administrativas",
  },
  {
    title: "Backup",
    href: "/admin/backup",
    icon: DatabaseBackup,
    description: "Cópias do banco de dados",
  },
];

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  DatabaseBackup,
  FileText,
  SlidersHorizontal,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Permission } from "@/lib/permissions";

export interface AdminNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Sem ela, o item não aparece. Cada página confere a mesma permissão do seu lado. */
  permission: Permission;
}

/**
 * Navegação do painel administrativo.
 *
 * Separada de `nav.ts` de propósito: são dois produtos com públicos diferentes, e misturar
 * os menus é o primeiro passo para alguém acabar exibindo item de admin para usuário comum.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  {
    title: "Painel",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    description: "Números da plataforma e saúde dos serviços",
    permission: Permission.VIEW_SYSTEM_HEALTH,
  },
  {
    title: "Auditoria",
    href: "/admin/audit",
    icon: ScrollText,
    description: "Acessos, senhas e ações sensíveis de toda a plataforma",
    permission: Permission.VIEW_AUDIT,
  },
  {
    title: "Usuários",
    href: "/admin/users",
    icon: Users,
    description: "Cadastro, permissões e ações administrativas",
    permission: Permission.MANAGE_USERS,
  },
  {
    title: "Monitoramento",
    href: "/admin/monitoring",
    icon: Activity,
    description: "Disponibilidade, latência e cobertura ao longo do tempo",
    permission: Permission.VIEW_SYSTEM_HEALTH,
  },
  {
    title: "Cargos",
    href: "/admin/roles",
    icon: ShieldCheck,
    description: "O que cada cargo alcança, gerado do mapa de permissões",
    permission: Permission.VIEW_AUDIT,
  },
  {
    title: "Logs",
    href: "/admin/logs",
    icon: FileText,
    description: "O que a aplicação registrou, com busca e filtro por nível",
    permission: Permission.VIEW_APPLICATION_LOGS,
  },
  {
    title: "Configurações",
    href: "/admin/settings",
    icon: SlidersHorizontal,
    description: "Parâmetros de operação, sem recriar container",
    permission: Permission.MANAGE_PLATFORM,
  },
  {
    title: "Backup",
    href: "/admin/backup",
    icon: DatabaseBackup,
    description: "Cópias do banco de dados",
    permission: Permission.MANAGE_BACKUPS,
  },
];

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Wallet,
  PieChart,
  Search,
  Building2,
  Coins,
  HandCoins,
  Star,
  Bell,
  Settings,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Visão geral",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Carteira",
    items: [
      { title: "Minha Carteira", href: "/portfolio", icon: Wallet },
      { title: "Proventos", href: "/dividends", icon: HandCoins },
      { title: "Recomendação de Aporte", href: "/contribution", icon: Coins },
      { title: "Alocação", href: "/allocation", icon: PieChart },
    ],
  },
  {
    label: "Análise",
    items: [
      { title: "Screener de Ações", href: "/screener/stocks", icon: Search },
      { title: "Screener de FIIs", href: "/screener/fiis", icon: Building2 },
    ],
  },
  {
    label: "Acompanhamento",
    items: [
      { title: "Lista de Observação", href: "/watchlist", icon: Star },
      { title: "Alertas", href: "/alerts", icon: Bell },
    ],
  },
  {
    label: "Conta",
    items: [{ title: "Configurações", href: "/settings", icon: Settings }],
  },
];

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export type DashboardNavGroup = "workspace" | "account" | "admin";

export interface DashboardNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  group: DashboardNavGroup;
  match?: "exact" | "prefix";
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard, group: "workspace", match: "exact" },
  { name: "Reviews", href: "/dashboard/reviews", icon: ClipboardCheck, group: "workspace", match: "prefix" },
  { name: "Visualizer", href: "/dashboard/diagrams", icon: Network, group: "workspace", match: "prefix" },
  { name: "AI Rules", href: "/dashboard/rulesets", icon: Sparkles, group: "workspace", match: "prefix" },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3, group: "workspace", match: "prefix" },
  { name: "Billing", href: "/dashboard/billing", icon: CreditCard, group: "account", match: "prefix" },
  { name: "Settings", href: "/dashboard/settings", icon: Settings, group: "account", match: "prefix" },
  { name: "Admin", href: "/admin", icon: ShieldCheck, group: "admin", match: "prefix" },
];

export const DASHBOARD_NAV_GROUPS: { id: DashboardNavGroup; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "account", label: "Account" },
  { id: "admin", label: "Admin" },
];

export function isDashboardNavItemActive(pathname: string, item: DashboardNavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

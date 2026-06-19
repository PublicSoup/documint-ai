export interface DashboardNavItem {
  name: string;
  href: string;
  match?: "exact" | "prefix";
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { name: "Overview", href: "/dashboard", match: "exact" },
  { name: "Reviews", href: "/dashboard/reviews", match: "prefix" },
  { name: "Visualizer", href: "/dashboard/diagrams", match: "prefix" },
  { name: "AI Rules", href: "/dashboard/rulesets", match: "prefix" },
  { name: "Analytics", href: "/dashboard/analytics", match: "prefix" },
  { name: "Billing", href: "/dashboard/billing", match: "prefix" },
  { name: "Settings", href: "/dashboard/settings", match: "prefix" },
  { name: "Admin", href: "/admin", match: "prefix" },
];

export function isDashboardNavItemActive(pathname: string, item: DashboardNavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

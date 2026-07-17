"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Code2,
  FileCode2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";

import {
  DASHBOARD_NAV_GROUPS,
  DASHBOARD_NAV_ITEMS,
  isDashboardNavItemActive,
} from "@/components/dashboard/header/nav-config";
import { GlobalSearch } from "@/components/global-search";
import { NotificationCenter } from "@/components/notification-center";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";

const COLLAPSE_STORAGE_KEY = "documint:sidebar-collapsed";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore the collapsed preference after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/10 bg-[#050508]/95 backdrop-blur-2xl transition-[width] duration-200 ease-in-out md:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <SidebarBody collapsed={collapsed} pathname={pathname} />
        <SidebarFooter collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-[#050508] shadow-2xl">
            <div className="flex items-center justify-between px-3 pt-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarBody collapsed={false} pathname={pathname} />
          </aside>
        </div>
      )}

      {/* Content column, offset by the sidebar on desktop */}
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200 ease-in-out",
          collapsed ? "md:pl-[76px]" : "md:pl-64",
        )}
      >
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050508]/80 backdrop-blur-2xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white/60 transition-colors hover:text-white md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden min-w-0 flex-1 lg:block">
              <div className="max-w-md">
                <GlobalSearch />
              </div>
            </div>

            <div className="flex flex-1 items-center justify-end gap-3 lg:flex-none">
              <a
                href="/code"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
              >
                <Code2 className="h-4 w-4" />
                <span className="hidden sm:inline">Open IDE</span>
              </a>

              <NotificationCenter />

              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white/60 transition-colors hover:border-red-400/20 hover:bg-red-400/10 hover:text-red-300"
                aria-label="Sign out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-12 pt-8 animate-fade-in sm:px-6 lg:px-8">
          {children}
        </main>

        <SiteFooter />
      </div>
    </>
  );
}

function SidebarBody({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  return (
    <>
      <Link
        href="/dashboard"
        className={cn(
          "group flex h-16 shrink-0 items-center gap-3 px-4",
          collapsed && "justify-center px-0",
        )}
        aria-label="DocuMint dashboard"
      >
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-lg shadow-primary/10 transition-colors group-hover:bg-primary/15">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          <FileCode2 className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <span className="block text-sm font-semibold text-white">DocuMint</span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              <ShieldCheck className="h-3 w-3 text-emerald-300" />
              Control plane
            </span>
          </div>
        )}
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 custom-scrollbar">
        {DASHBOARD_NAV_GROUPS.map((group, groupIndex) => {
          const items = DASHBOARD_NAV_ITEMS.filter((item) => item.group === group.id);
          if (items.length === 0) return null;

          return (
            <div key={group.id} className={cn(groupIndex > 0 && "pt-3")}>
              {collapsed ? (
                groupIndex > 0 && <div className="mx-2 mb-2 h-px bg-white/8" />
              ) : (
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                  {group.label}
                </p>
              )}

              <div className="space-y-1">
                {items.map((item) => {
                  const isActive = isDashboardNavItemActive(pathname, item);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.name : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "bg-white/10 text-white shadow-sm"
                          : "text-white/55 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      {isActive && (
                        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
                      )}
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}

function SidebarFooter({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="hidden shrink-0 border-t border-white/10 p-3 md:block">
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white",
          collapsed && "justify-center px-0",
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
        ) : (
          <>
            <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </div>
  );
}

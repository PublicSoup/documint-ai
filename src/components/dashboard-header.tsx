"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, FileCode2, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";

import {
  DASHBOARD_NAV_ITEMS,
  isDashboardNavItemActive,
} from "@/components/dashboard/header/nav-config";
import { GlobalSearch } from "@/components/global-search";
import { NotificationCenter } from "@/components/notification-center";
import { cn } from "@/lib/utils";

export function DashboardHeader() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#050508]/90 backdrop-blur-2xl">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-5">
            <Link
              href="/dashboard"
              className="group flex shrink-0 items-center gap-3"
              aria-label="DocuMint dashboard"
            >
              <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-lg shadow-primary/10 transition-colors group-hover:bg-primary/15">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
                <FileCode2 className="h-5 w-5" />
              </div>
              <div className="hidden leading-tight sm:block">
                <span className="block text-sm font-semibold text-white">DocuMint</span>
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                  <ShieldCheck className="h-3 w-3 text-emerald-300" />
                  Control plane
                </span>
              </div>
            </Link>

            <div className="hidden items-center gap-1 overflow-x-auto rounded-xl border border-white/8 bg-white/[0.03] p-1 md:flex custom-scrollbar">
              {DASHBOARD_NAV_ITEMS.map((item) => {
                const isActive = isDashboardNavItemActive(pathname, item);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-all",
                      isActive
                        ? "bg-white/10 text-white shadow-sm"
                        : "text-white/55 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    {item.name}
                    {isActive && (
                      <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-primary" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden w-72 lg:block">
              <GlobalSearch />
            </div>

            <a
              href="/code"
              className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90 md:inline-flex"
            >
              <Code2 className="h-4 w-4" />
              Open IDE
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
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, FileCode2, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { DASHBOARD_NAV_ITEMS, isDashboardNavItemActive } from "@/components/dashboard/header/nav-config";
import { GlobalSearch } from "@/components/global-search";
import { NotificationCenter } from "@/components/notification-center";
import { cn } from "@/lib/utils";

export function DashboardHeader() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 border-b border-white/5 bg-black/20 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8 min-w-0">
            <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center transition-all">
                <FileCode2 className="text-white w-5 h-5" />
              </div>
              <span className="font-bold text-lg text-white">DocuMint</span>
            </Link>

            <div className="hidden md:flex items-center gap-1 overflow-x-auto custom-scrollbar">
              {DASHBOARD_NAV_ITEMS.map((item) => {
                const isActive = isDashboardNavItemActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm font-medium transition-all relative whitespace-nowrap",
                      isActive ? "text-white bg-white/10" : "text-white/60 hover:text-white hover:bg-white/5",
                    )}
                  >
                    {item.name}
                    {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-primary rounded-full" />}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <Link
              href="/code"
              className="hidden md:inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
            >
              <Code2 className="w-4 h-4" />
              Open IDE
            </Link>

            <div className="hidden sm:block w-64">
              <GlobalSearch />
            </div>

            <NotificationCenter />

            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-red-400/10 hover:text-red-400"
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

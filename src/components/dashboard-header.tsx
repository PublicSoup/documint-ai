"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileCode2, Bell, Settings, LogOut, Search, Menu } from "lucide-react";
import { GlobalSearch } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/notification-center";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

export function DashboardHeader() {
    const pathname = usePathname();

    const navItems = [
        { name: "Overview", href: "/dashboard" },
        { name: "Code", href: "/code" },
        { name: "Reviews", href: "/dashboard/reviews" },
        { name: "Visualizer", href: "/dashboard/diagrams" },
        { name: "AI Rules", href: "/dashboard/rulesets" },
        { name: "Analytics", href: "/dashboard/analytics" },
        { name: "Billing Hub", href: "/dashboard/billing" },
        { name: "Settings", href: "/dashboard/settings" },
        { name: "Admin Panel", href: "/admin" },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-40 class-header border-b border-white/5 bg-black/20 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <div className="flex items-center gap-8">
                        <Link href="/dashboard" className="flex items-center gap-2 group">
                            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center transition-all">
                                <FileCode2 className="text-white w-5 h-5" />
                            </div>
                            <span className="font-bold text-lg text-white">
                                DocuMint
                            </span>
                        </Link>

                        {/* Navigation Links */}
                        <div className="hidden md:flex items-center gap-1">
                            {navItems.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            "px-3 py-2 rounded-lg text-sm font-medium transition-all relative",
                                            isActive
                                                ? "text-white bg-white/10"
                                                : "text-white/60 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        {item.name}
                                        {isActive && (
                                            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-primary rounded-full"></span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Section */}
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:block w-64">
                            <GlobalSearch />
                        </div>

                        <NotificationCenter />

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => signOut()}
                            className="text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded-full"
                        >
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </nav>
    );
}

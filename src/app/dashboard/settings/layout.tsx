import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, CreditCard, Bell, Shield, Users } from "lucide-react";
import Link from "next/link";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <User className="w-6 h-6 text-primary" />
                        Settings
                    </h1>
                    <p className="text-muted-foreground text-sm">Manage your account preferences and workspace settings.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Sidebar Navigation */}
                <Card className="glass-card border-white/5 md:col-span-1 h-fit">
                    <CardContent className="p-2">
                        <nav className="flex flex-col gap-1">
                            <Link href="/dashboard/settings">
                                <Button variant="ghost" className="w-full justify-start text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5">
                                    <User className="w-4 h-4 mr-2" />
                                    General
                                </Button>
                            </Link>
                            <Link href="/dashboard/billing">
                                <Button variant="ghost" className="w-full justify-start text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5">
                                    <CreditCard className="w-4 h-4 mr-2" />
                                    Billing
                                </Button>
                            </Link>
                            <Link href="/dashboard/settings/team">
                                <Button variant="ghost" className="w-full justify-start text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5">
                                    <Users className="w-4 h-4 mr-2" />
                                    Team
                                </Button>
                            </Link>
                            <Button variant="ghost" className="justify-start text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5">
                                <Bell className="w-4 h-4 mr-2" />
                                Notifications
                            </Button>
                            <Button variant="ghost" className="justify-start text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5">
                                <Shield className="w-4 h-4 mr-2" />
                                Security
                            </Button>
                        </nav>
                    </CardContent>
                </Card>

                {/* Main Content Area */}
                <div className="md:col-span-3 space-y-6">
                    {children}
                </div>
            </div>
        </div>
    );
}

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, User, CreditCard, Bell, Shield } from "lucide-react";
import Link from "next/link";

export default async function SettingsPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/auth/login");
    }

    return (
        <div className="space-y-6">
            <Card className="glass-card border-white/5">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-white">Profile Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Display Name</Label>
                        <Input
                            defaultValue={session.user?.name || ""}
                            className="bg-black/20 border-white/10 text-white"
                            placeholder="Enter your name"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Email Address</Label>
                        <Input
                            defaultValue={session.user?.email || ""}
                            disabled
                            className="bg-white/5 border-white/5 text-muted-foreground cursor-not-allowed"
                        />
                        <p className="text-[10px] text-muted-foreground">Email cannot be changed relative to your provider.</p>
                    </div>
                    <div className="pt-4 flex justify-end">
                        <Button>Save Changes</Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="glass-card border-white/5">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-white">Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                        <div>
                            <h4 className="text-sm font-medium text-white">Email Notifications</h4>
                            <p className="text-xs text-muted-foreground">Receive weekly digest emails</p>
                        </div>
                        <div className="h-5 w-9 bg-primary rounded-full relative cursor-pointer">
                            <div className="absolute top-1 right-1 w-3 h-3 bg-white rounded-full shadow-sm" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                        <div>
                            <h4 className="text-sm font-medium text-white">Marketing Emails</h4>
                            <p className="text-xs text-muted-foreground">Receive updates about new features</p>
                        </div>
                        <div className="h-5 w-9 bg-white/10 rounded-full relative cursor-pointer">
                            <div className="absolute top-1 left-1 w-3 h-3 bg-white/50 rounded-full shadow-sm" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, User, KeyRound, Bell, Shield, Check, Loader2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
    const { data: session, update: updateSession } = useSession();

    // Profile state
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState("");

    // Password state
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordError, setPasswordError] = useState("");

    // Preferences state
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [marketingEmails, setMarketingEmails] = useState(false);

    useEffect(() => {
        if (session?.user?.name) {
            setName(session.user.name);
        }
    }, [session]);

    const handleSaveProfile = async () => {
        setSaving(true);
        setError("");
        setSaveSuccess(false);

        try {
            const res = await fetch("/api/user/update", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    settings: { emailNotifications, marketingEmails },
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save");

            setSaveSuccess(true);
            await updateSession({ name });
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async () => {
        setPasswordError("");
        setPasswordSuccess(false);

        if (newPassword !== confirmPassword) {
            setPasswordError("Passwords do not match");
            return;
        }
        if (newPassword.length < 8) {
            setPasswordError("Password must be at least 8 characters");
            return;
        }

        setPasswordSaving(true);

        try {
            const res = await fetch("/api/user/update", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to change password");

            setPasswordSuccess(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setTimeout(() => setPasswordSuccess(false), 3000);
        } catch (e: any) {
            setPasswordError(e.message);
        } finally {
            setPasswordSaving(false);
        }
    };

    if (!session) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    const isAdmin = (session.user as any)?.role === "ADMIN";

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {/* Profile Section */}
            <Card className="glass-card border-white/5">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" />
                        Profile Information
                    </CardTitle>
                    <CardDescription>Manage your account details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Display Name</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
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

                    {error && (
                        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="pt-2 flex justify-end">
                        <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <Check className="w-4 h-4" /> : null}
                            {saveSuccess ? "Saved!" : "Save Changes"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Password Section */}
            <Card className="glass-card border-white/5">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-primary" />
                        Change Password
                    </CardTitle>
                    <CardDescription>Update your account password</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Current Password</Label>
                        <div className="relative">
                            <Input
                                type={showCurrentPw ? "text" : "password"}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="bg-black/20 border-white/10 text-white pr-10"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPw(!showCurrentPw)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                            >
                                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">New Password</Label>
                        <div className="relative">
                            <Input
                                type={showNewPw ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="bg-black/20 border-white/10 text-white pr-10"
                                placeholder="At least 8 characters"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPw(!showNewPw)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                            >
                                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Confirm New Password</Label>
                        <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="bg-black/20 border-white/10 text-white"
                            placeholder="Repeat new password"
                        />
                    </div>

                    {passwordError && (
                        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {passwordError}
                        </div>
                    )}

                    <div className="pt-2 flex justify-end">
                        <Button
                            onClick={handleChangePassword}
                            disabled={passwordSaving || !currentPassword || !newPassword}
                            variant="outline"
                            className="gap-2"
                        >
                            {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : passwordSuccess ? <Check className="w-4 h-4" /> : null}
                            {passwordSuccess ? "Password Updated!" : "Change Password"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Preferences Section */}
            <Card className="glass-card border-white/5">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                        <Bell className="w-5 h-5 text-primary" />
                        Preferences
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                        <div>
                            <h4 className="text-sm font-medium text-white">Email Notifications</h4>
                            <p className="text-xs text-muted-foreground">Receive weekly digest emails</p>
                        </div>
                        <button
                            onClick={() => setEmailNotifications(!emailNotifications)}
                            className={`h-5 w-9 rounded-full relative cursor-pointer transition-colors ${emailNotifications ? "bg-primary" : "bg-white/10"
                                }`}
                        >
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${emailNotifications ? "right-1" : "left-1"
                                }`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                        <div>
                            <h4 className="text-sm font-medium text-white">Marketing Emails</h4>
                            <p className="text-xs text-muted-foreground">Receive updates about new features</p>
                        </div>
                        <button
                            onClick={() => setMarketingEmails(!marketingEmails)}
                            className={`h-5 w-9 rounded-full relative cursor-pointer transition-colors ${marketingEmails ? "bg-primary" : "bg-white/10"
                                }`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full shadow-sm transition-all ${marketingEmails ? "right-1 bg-white" : "left-1 bg-white/50"
                                }`} />
                        </button>
                    </div>
                </CardContent>
            </Card>

            {/* Admin Section (visible only to admins) */}
            {isAdmin && (
                <Card className="glass-card border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                            <Shield className="w-5 h-5 text-primary" />
                            Administration
                        </CardTitle>
                        <CardDescription>Admin-only features</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/admin">
                            <Button variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
                                <Shield className="w-4 h-4" />
                                Open Admin Panel
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            {/* Danger Zone */}
            <Card className="glass-card border-red-500/20">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-red-400 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Danger Zone
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                        <div>
                            <h4 className="text-sm font-medium text-white">Delete Account</h4>
                            <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                        </div>
                        <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/20">
                            Delete Account
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

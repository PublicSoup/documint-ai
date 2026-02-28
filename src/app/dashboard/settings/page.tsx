"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    User,
    KeyRound,
    Bell,
    Shield,
    Check,
    Loader2,
    AlertTriangle,
    Eye,
    EyeOff,
    CreditCard,
    Share2,
    Sparkles,
    Terminal,
    Users,
} from "lucide-react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitHubSettings } from "@/components/github-settings";
import { ApiKeySettings } from "@/components/api-key-settings";
import TeamManagement from "@/components/team-management";
import { useToast } from "@/components/toast";

function getApiMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") {
        return fallback;
    }

    const record = payload as Record<string, unknown>;

    if (typeof record.message === "string" && record.message.trim().length > 0) {
        return record.message;
    }

    if (
        typeof record.error === "string" &&
        record.error.trim().length > 0 &&
        record.error !== "ApiException" &&
        record.error !== "Error"
    ) {
        return record.error;
    }

    return fallback;
}

export default function SettingsPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { data: session, update: updateSession } = useSession();
    const [activeTab, setActiveTab] = useState("profile");

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
    const [commentNotifications, setCommentNotifications] = useState(true);
    const [mentionNotifications, setMentionNotifications] = useState(true);
    const [marketingEmails, setMarketingEmails] = useState(false);
    const [autoRegenerate, setAutoRegenerate] = useState(false);
    const [loadingSettings, setLoadingSettings] = useState(true);
    const [settingsError, setSettingsError] = useState("");
    const [subscription, setSubscription] = useState<{ plan: string } | null>(null);
    const [notificationSaving, setNotificationSaving] = useState(false);
    const [notificationSaveSuccess, setNotificationSaveSuccess] = useState(false);
    const [notificationError, setNotificationError] = useState("");
    const [initialNotificationSettings, setInitialNotificationSettings] = useState({
        emailNotifications: true,
        commentNotifications: true,
        mentionNotifications: true,
        marketingEmails: false,
        autoRegenerate: false,
    });

    const fetchSettings = useCallback(async (signal?: AbortSignal) => {
        setLoadingSettings(true);
        setSettingsError("");

        try {
            const [notifyRes, subRes] = await Promise.all([
                fetch("/api/webhooks/notify", { signal }),
                fetch("/api/user/subscription", { signal }),
            ]);

            const notifyData = await notifyRes.json().catch(() => ({}));
            const subData = await subRes.json().catch(() => ({}));

            if (notifyRes.ok) {
                const nextEmailNotifications = Boolean(
                    notifyData.notifications?.onDocChange ??
                        notifyData.notifications?.notifyOnDocChange ??
                        true,
                );
                const nextCommentNotifications = Boolean(
                    notifyData.notifications?.onComment ??
                        notifyData.notifications?.notifyOnComment ??
                        true,
                );
                const nextMentionNotifications = Boolean(
                    notifyData.notifications?.onMention ??
                        notifyData.notifications?.notifyOnMention ??
                        true,
                );
                const nextMarketingEmails = Boolean(notifyData.notifications?.marketingEmails ?? false);
                const nextAutoRegenerate = Boolean(notifyData.notifications?.autoRegenerate ?? false);

                setEmailNotifications(nextEmailNotifications);
                setCommentNotifications(nextCommentNotifications);
                setMentionNotifications(nextMentionNotifications);
                setMarketingEmails(nextMarketingEmails);
                setAutoRegenerate(nextAutoRegenerate);
                setInitialNotificationSettings({
                    emailNotifications: nextEmailNotifications,
                    commentNotifications: nextCommentNotifications,
                    mentionNotifications: nextMentionNotifications,
                    marketingEmails: nextMarketingEmails,
                    autoRegenerate: nextAutoRegenerate,
                });
            } else {
                setSettingsError(getApiMessage(notifyData, "Failed to load notification preferences"));
            }

            if (subRes.ok) {
                setSubscription(subData);
            }
        } catch (requestError: unknown) {
            if (!signal?.aborted) {
                const message = requestError instanceof Error ? requestError.message : "Failed to load preferences";
                setSettingsError(message);
            }
        } finally {
            if (!signal?.aborted) {
                setLoadingSettings(false);
            }
        }
    }, []);

    useEffect(() => {
        if (session?.user?.name) {
            setName(session.user.name);
        }

        const controller = new AbortController();
        fetchSettings(controller.signal);

        const params = new URLSearchParams(window.location.search);
        const tab = params.get("tab");
        if (tab && ["profile", "security", "integrations", "billing", "api", "team"].includes(tab)) {
            setActiveTab(tab);
        }

        return () => controller.abort();
    }, [fetchSettings, session]);

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
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(getApiMessage(data, "Failed to save"));

            setSaveSuccess(true);
            await updateSession({ name });
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveNotifications = async () => {
        setNotificationSaving(true);
        setNotificationError("");
        setNotificationSaveSuccess(false);

        try {
            const response = await fetch("/api/webhooks/notify", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    notifications: {
                        notifyOnDocChange: emailNotifications,
                        notifyOnComment: commentNotifications,
                        notifyOnMention: mentionNotifications,
                        marketingEmails,
                        autoRegenerate,
                    },
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || data.message || "Failed to save notification settings");
            }

            setInitialNotificationSettings({
                emailNotifications,
                commentNotifications,
                mentionNotifications,
                marketingEmails,
                autoRegenerate,
            });
            setNotificationSaveSuccess(true);
            setTimeout(() => setNotificationSaveSuccess(false), 3000);
        } catch (saveError: unknown) {
            setNotificationError(saveError instanceof Error ? saveError.message : "Failed to save notification settings");
        } finally {
            setNotificationSaving(false);
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
        } catch (e: unknown) {
            setPasswordError(e instanceof Error ? e.message : "Failed to change password");
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

    const isAdmin = session.user.role === "ADMIN";
    const hasUnsavedNotificationChanges =
        emailNotifications !== initialNotificationSettings.emailNotifications ||
        commentNotifications !== initialNotificationSettings.commentNotifications ||
        mentionNotifications !== initialNotificationSettings.mentionNotifications ||
        marketingEmails !== initialNotificationSettings.marketingEmails ||
        autoRegenerate !== initialNotificationSettings.autoRegenerate;

    return (
        <div className="space-y-8 max-w-4xl mx-auto pb-20 animate-fade-in">
            <header className="space-y-1">
                <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Account Settings</h1>
                <p className="text-muted-foreground text-sm font-medium">Manage your profile, security, and workspace integrations.</p>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="bg-white/5 border border-white/5 p-1 rounded-xl">
                    <TabsTrigger value="profile" className="rounded-lg gap-2">
                        <User className="w-3.5 h-3.5" />
                        Profile
                    </TabsTrigger>
                    <TabsTrigger value="security" className="rounded-lg gap-2">
                        <KeyRound className="w-3.5 h-3.5" />
                        Security
                    </TabsTrigger>
                    <TabsTrigger value="integrations" className="rounded-lg gap-2">
                        <Share2 className="w-3.5 h-3.5" />
                        Integrations
                    </TabsTrigger>
                    <TabsTrigger value="team" className="rounded-lg gap-2">
                        <Users className="w-3.5 h-3.5" />
                        Team
                    </TabsTrigger>
                    <TabsTrigger value="billing" className="rounded-lg gap-2">
                        <CreditCard className="w-3.5 h-3.5" />
                        Billing
                    </TabsTrigger>
                    <TabsTrigger value="api" className="rounded-lg gap-2">
                        <Terminal className="w-3.5 h-3.5" />
                        API
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                    <Card className="glass-card border-white/5">
                        <CardHeader>
                            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                <User className="w-5 h-5 text-primary" />
                                Profile Information
                            </CardTitle>
                            <CardDescription>Manage your public display information</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Display Name</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="bg-black/20 border-white/10 text-white h-12 rounded-xl focus:ring-primary/50"
                                    placeholder="Enter your name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Email Address</Label>
                                <Input
                                    defaultValue={session.user?.email || ""}
                                    disabled
                                    className="bg-white/5 border-white/5 text-muted-foreground cursor-not-allowed h-12 rounded-xl"
                                />
                                <p className="text-[10px] text-muted-foreground font-medium">Your email is managed by your authentication provider.</p>
                            </div>

                            {error && (
                                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 px-4 py-3 rounded-xl flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="pt-4 flex justify-end">
                                <Button onClick={handleSaveProfile} disabled={saving || loadingSettings} className="h-11 px-8 rounded-xl font-bold shadow-lg shadow-primary/20">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : saveSuccess ? <Check className="w-4 h-4 mr-2" /> : null}
                                    {saveSuccess ? "Updated!" : "Save Changes"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass-card border-white/5">
                        <CardHeader>
                            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                <Bell className="w-5 h-5 text-primary" />
                                Notifications
                            </CardTitle>
                            <CardDescription>Configure how we reach you</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {loadingSettings && (
                                <div className="text-xs text-zinc-400 bg-white/5 border border-white/10 px-3 py-2 rounded-xl flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Loading notification preferences...
                                </div>
                            )}

                            {settingsError && (
                                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                        {settingsError}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2.5 text-[10px]"
                                        disabled={loadingSettings}
                                        onClick={() => {
                                            void fetchSettings();
                                        }}
                                    >
                                        {loadingSettings ? <Loader2 className="w-3 h-3 animate-spin" /> : "Retry"}
                                    </Button>
                                </div>
                            )}

                            {notificationError && (
                                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl flex items-center gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    {notificationError}
                                </div>
                            )}

                            {notificationSaveSuccess && (
                                <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl flex items-center gap-2">
                                    <Check className="w-3.5 h-3.5 shrink-0" />
                                    Notification preferences saved.
                                </div>
                            )}

                            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                                <div>
                                    <h4 className="text-sm font-bold text-white">Email Notifications</h4>
                                    <p className="text-xs text-muted-foreground font-medium">Receive documentation health reports and updates</p>
                                </div>
                                <button
                                    disabled={loadingSettings || notificationSaving}
                                    onClick={() => setEmailNotifications(!emailNotifications)}
                                    className={`h-6 w-11 rounded-full relative cursor-pointer transition-all duration-300 ${emailNotifications ? "bg-primary shadow-[0_0_15px_-3px_rgba(124,58,237,0.5)]" : "bg-white/10"
                                        }`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300 ${emailNotifications ? "right-1" : "left-1"
                                        }`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                                <div>
                                    <h4 className="text-sm font-bold text-white">Comment Notifications</h4>
                                    <p className="text-xs text-muted-foreground font-medium">Receive alerts when someone comments on your docs</p>
                                </div>
                                <button
                                    disabled={loadingSettings || notificationSaving}
                                    onClick={() => setCommentNotifications(!commentNotifications)}
                                    className={`h-6 w-11 rounded-full relative cursor-pointer transition-all duration-300 ${commentNotifications ? "bg-primary shadow-[0_0_15px_-3px_rgba(124,58,237,0.5)]" : "bg-white/10"
                                        }`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300 ${commentNotifications ? "right-1" : "left-1"
                                        }`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                                <div>
                                    <h4 className="text-sm font-bold text-white">Mention Notifications</h4>
                                    <p className="text-xs text-muted-foreground font-medium">Get notified when you are @mentioned in a discussion</p>
                                </div>
                                <button
                                    disabled={loadingSettings || notificationSaving}
                                    onClick={() => setMentionNotifications(!mentionNotifications)}
                                    className={`h-6 w-11 rounded-full relative cursor-pointer transition-all duration-300 ${mentionNotifications ? "bg-primary shadow-[0_0_15px_-3px_rgba(124,58,237,0.5)]" : "bg-white/10"
                                        }`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300 ${mentionNotifications ? "right-1" : "left-1"
                                        }`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                                <div>
                                    <h4 className="text-sm font-bold text-white">Product Updates</h4>
                                    <p className="text-xs text-muted-foreground font-medium">Receive release notes, feature launches, and product announcements</p>
                                </div>
                                <button
                                    disabled={loadingSettings || notificationSaving}
                                    onClick={() => setMarketingEmails(!marketingEmails)}
                                    className={`h-6 w-11 rounded-full relative cursor-pointer transition-all duration-300 ${marketingEmails ? "bg-primary shadow-[0_0_15px_-3px_rgba(124,58,237,0.5)]" : "bg-white/10"
                                        }`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300 ${marketingEmails ? "right-1" : "left-1"
                                        }`} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                                <div>
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-primary" />
                                        Smart Auto-Regeneration
                                    </h4>
                                    <p className="text-xs text-muted-foreground font-medium">Automatically update documentation when code changes significantly</p>
                                </div>
                                <button
                                    disabled={loadingSettings || notificationSaving}
                                    onClick={() => setAutoRegenerate(!autoRegenerate)}
                                    className={`h-6 w-11 rounded-full relative cursor-pointer transition-all duration-300 ${autoRegenerate ? "bg-emerald-500 shadow-[0_0_15px_-3px_rgba(16,185,129,0.5)]" : "bg-white/10"
                                        }`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300 ${autoRegenerate ? "right-1" : "left-1"
                                        }`} />
                                </button>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <Button
                                    onClick={handleSaveNotifications}
                                    disabled={loadingSettings || notificationSaving || !hasUnsavedNotificationChanges}
                                    className="h-11 px-8 rounded-xl font-bold shadow-lg shadow-primary/20"
                                >
                                    {notificationSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : notificationSaveSuccess ? <Check className="w-4 h-4 mr-2" /> : null}
                                    {notificationSaveSuccess ? "Saved" : "Save Notification Preferences"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="security" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                    <Card className="glass-card border-white/5">
                        <CardHeader>
                            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                <KeyRound className="w-5 h-5 text-primary" />
                                Authentication
                            </CardTitle>
                            <CardDescription>Update your secure access credentials</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Current Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showCurrentPw ? "text" : "password"}
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="bg-black/20 border-white/10 text-white h-12 rounded-xl pr-12"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                                    >
                                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">New Password</Label>
                                    <div className="relative">
                                        <Input
                                            type={showNewPw ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="bg-black/20 border-white/10 text-white h-12 rounded-xl pr-12"
                                            placeholder="At least 8 chars"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPw(!showNewPw)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                                        >
                                            {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Confirm New Password</Label>
                                    <Input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="bg-black/20 border-white/10 text-white h-12 rounded-xl"
                                        placeholder="Repeat new password"
                                    />
                                </div>
                            </div>

                            {passwordError && (
                                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 px-4 py-3 rounded-xl flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    {passwordError}
                                </div>
                            )}

                            <div className="pt-4 flex justify-end">
                                <Button
                                    onClick={handleChangePassword}
                                    disabled={passwordSaving || !currentPassword || !newPassword}
                                    className="h-11 px-8 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all border border-white/10"
                                >
                                    {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : passwordSuccess ? <Check className="w-4 h-4 mr-2" /> : null}
                                    {passwordSuccess ? "Changed!" : "Update Password"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {isAdmin && (
                        <Card className="glass-card border-primary/20 bg-primary/5">
                            <CardHeader>
                                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-primary" />
                                    System Administration
                                </CardTitle>
                                <CardDescription>Access low-level platform controls</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Link href="/admin">
                                    <Button variant="outline" className="h-11 rounded-xl gap-2 border-primary/30 text-primary hover:bg-primary/10 font-bold">
                                        <Shield className="w-4 h-4" />
                                        Launch Admin Console
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="glass-card border-red-500/20">
                        <CardHeader>
                            <CardTitle className="text-lg font-bold text-red-400 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                Danger Zone
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
                                <div>
                                    <h4 className="text-sm font-bold text-white">Delete Account</h4>
                                    <p className="text-xs text-muted-foreground font-medium">Permanently remove your account and all documentation data</p>
                                </div>
                                <Button variant="outline" size="sm" className="h-9 rounded-lg border-red-500/30 text-red-400 hover:bg-red-500/20 font-bold">
                                    Delete Account
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="integrations" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                    <GitHubSettings />
                    
                    <Card className="glass-card border-white/5 opacity-50 grayscale cursor-not-allowed">
                        <CardHeader>
                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                                    <span className="font-black text-xs">S</span>
                                </div>
                                Slack Integration
                            </CardTitle>
                            <CardDescription className="text-xs">Coming Q3 2026: Documentation change alerts</CardDescription>
                        </CardHeader>
                    </Card>
                </TabsContent>

                <TabsContent value="team" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                    <TeamManagement />
                </TabsContent>

                <TabsContent value="api" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                    <ApiKeySettings />
                </TabsContent>

                <TabsContent value="billing" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                    <Card className="glass-card border-white/5 min-h-[400px] flex items-center justify-center text-center">
                        <CardContent className="space-y-6">
                            <div className="w-16 h-16 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center mx-auto">
                                <CreditCard className="w-8 h-8 text-white/20" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white">Billing Information</h3>
                                <p className="text-sm text-muted-foreground max-w-sm">
                                    You are currently on the <strong className="text-primary uppercase tracking-wider">{subscription?.plan || "Free"}</strong> plan. 
                                    {subscription?.plan?.toLowerCase() === "free" ? " Upgrade to unlock unlimited documentation and team features." : " Manage your subscription and payment methods below."}
                                </p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <Button className="h-12 px-10 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest" onClick={() => router.push("/dashboard/billing")}>
                                    {subscription?.plan?.toLowerCase() === "free" ? "View Plans" : "Change Plan"}
                                </Button>
                                {subscription?.plan?.toLowerCase() !== "free" && (
                                    <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={async () => {
                                        try {
                                            const res = await fetch("/api/customer-portal", { method: "POST" });
                                            const data = await res.json();
                                            if (data.url) window.location.href = data.url;
                                        } catch (e) {
                                            toast("Failed to open billing portal", "error");
                                        }
                                    }}>
                                        Manage Billing Portal
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

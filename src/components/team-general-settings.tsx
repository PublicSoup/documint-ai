"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Label } from "./ui/label";
import { useToast } from "./toast";
import { useConfirm } from "./ui/confirm-dialog";

interface TeamSettingsProps {
    teamId: string;
    teamName: string;
    teamSlug: string;
}

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

function normalizeSlug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function TeamGeneralSettings({ teamId, teamName: initialName, teamSlug: initialSlug }: TeamSettingsProps) {
    const { toast } = useToast();
    const confirm = useConfirm();
    const router = useRouter();

    const [name, setName] = useState(initialName);
    const [slug, setSlug] = useState(initialSlug);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [deleteError, setDeleteError] = useState("");

    const hasChanges = useMemo(
        () => name.trim() !== initialName || slug.trim() !== initialSlug,
        [initialName, initialSlug, name, slug],
    );

    const validationError = useMemo(() => {
        if (name.trim().length < 2) {
            return "Team name must be at least 2 characters.";
        }

        if (slug.trim().length < 2) {
            return "Workspace slug must be at least 2 characters.";
        }

        if (!/^[a-z0-9-]+$/.test(slug.trim())) {
            return "Workspace slug can only contain lowercase letters, numbers, and hyphens.";
        }

        return "";
    }, [name, slug]);

    const canSubmit = hasChanges && !validationError && !saving;

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!canSubmit) return;

        setSaveError("");
        setSaving(true);

        try {
            const res = await fetch(`/api/teams/${teamId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    slug: slug.trim(),
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(getApiMessage(data, "Failed to update team"));
            }

            toast("Team updated successfully", "success");
            router.refresh();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "An unexpected error occurred";
            setSaveError(message);
            toast(message, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: "Delete team",
            description: `This will permanently delete "${name}" along with all files and documentation associated with this team. This action cannot be undone.`,
            confirmLabel: "Delete Team",
            variant: "destructive",
        });
        if (!confirmed) return;

        setDeleteError("");
        setDeleting(true);

        try {
            const res = await fetch(`/api/teams/${teamId}`, {
                method: "DELETE",
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(getApiMessage(data, "Failed to delete team"));
            }

            toast("Team deleted successfully", "success");
            router.push("/dashboard");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "An unexpected error occurred";
            setDeleteError(message);
            toast(message, "error");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="glass-card border-white/5">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                        General Settings
                    </CardTitle>
                    <CardDescription>Manage your team identity and project access</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleUpdate} className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Team Name</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="bg-black/20 border-white/10 text-white h-12 rounded-xl"
                                placeholder="Team Name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Workspace Slug</Label>
                            <div className="relative group">
                                <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <Input
                                    value={slug}
                                    onChange={(e) => setSlug(normalizeSlug(e.target.value))}
                                    className="bg-black/20 border-white/10 text-white h-12 rounded-xl pl-12 font-mono text-sm"
                                    placeholder="team-slug"
                                />
                            </div>
                            <p className="text-[10px] text-zinc-500 px-1">This is your unique team identifier used in workspace URLs.</p>
                        </div>

                        {validationError && (
                            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                {validationError}
                            </div>
                        )}

                        {saveError && (
                            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                                {saveError}
                            </div>
                        )}

                        <div className="pt-4 flex justify-end">
                            <Button disabled={!canSubmit}>
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Save Changes
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card className="glass-card border-rose-500/20 bg-rose-500/5">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-rose-400 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Danger Zone
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                        <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-tight">Delete Team</h4>
                            <p className="text-xs text-rose-200/60 font-medium">Permanently remove this team and all its resources</p>
                            {deleteError && <p className="text-xs text-rose-300 mt-2">{deleteError}</p>}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={deleting}
                            onClick={handleDelete}
                            className="h-10 px-6 bg-rose-600 hover:bg-rose-500 text-white border-none font-bold rounded-xl shadow-lg shadow-rose-500/20 transition-all"
                        >
                            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Team"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/toast";
import {
    Shield, Download, Filter, ChevronLeft, ChevronRight,
    FileText, Trash2, Eye, Edit2, Upload, LogOut, AlertTriangle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AuditLog {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    details: Record<string, unknown> | null;
    ip: string | null;
    createdAt: string;
}

const ACTION_ICONS: Record<string, LucideIcon> = {
    CREATE: Upload,
    UPDATE: Edit2,
    DELETE: Trash2,
    VIEW: Eye,
    EXPORT: Download,
    LOGIN: LogOut,
};

const ACTION_COLORS: Record<string, string> = {
    CREATE: "bg-green-500/20 text-green-300",
    UPDATE: "bg-blue-500/20 text-blue-300",
    DELETE: "bg-red-500/20 text-red-300",
    VIEW: "bg-white/10 text-gray-300",
    EXPORT: "bg-purple-500/20 text-purple-300",
    GENERATE_CHANGELOG: "bg-amber-500/20 text-amber-300",
};

export default function AuditLogViewer() {
    const { toast } = useToast();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filters, setFilters] = useState({
        action: "",
        entity: "",
        startDate: "",
        endDate: ""
    });
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        fetchLogs();
    }, [page, filters]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: page.toString() });
            if (filters.action) params.set("action", filters.action);
            if (filters.entity) params.set("entity", filters.entity);
            if (filters.startDate) params.set("startDate", filters.startDate);
            if (filters.endDate) params.set("endDate", filters.endDate);

            const res = await fetch(`/api/audit?${params}`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
                setTotalPages(data.pagination.pages);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const [verifying, setVerifying] = useState(false);
    const [integrityStatus, setIntegrityStatus] = useState<Record<string, boolean>>({});
    const [chainCompromised, setChainCompromised] = useState(false);

    const handleVerifyIntegrity = async () => {
        setVerifying(true);
        setChainCompromised(false);
        try {
            // Hit the real verification endpoint
            const res = await fetch(`/api/audit/verify?limit=${logs.length}`);
            if (res.ok) {
                const data = await res.json();
                
                const newStatus: Record<string, boolean> = {};
                (data.results as Array<{ id: string; entryValid: boolean }>).forEach((r) => {
                    newStatus[r.id] = r.entryValid;
                });
                
                setIntegrityStatus(newStatus);
                setChainCompromised(!data.success);
                
                if (!data.success) {
                    toast("Audit chain integrity compromise detected!", "error");
                } else {
                    toast("Audit chain verified successfully", "success");
                }
            } else {
                toast("Verification service unavailable", "error");
            }
        } catch (e) {
            console.error(e);
            toast("Failed to verify audit logs", "error");
        } finally {
            setVerifying(false);
        }
    };

    const handleExport = async (format: 'csv' | 'pdf') => {
        try {
            const res = await fetch("/api/audit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ format, ...filters })
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                toast(body?.error || `Failed to export ${format.toUpperCase()}`, "error");
                return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `audit-log-${new Date().toISOString().split("T")[0]}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            toast(`${format.toUpperCase()} export downloaded`, "success");
        } catch (error) {
            console.error(error);
            toast(`Failed to export ${format.toUpperCase()}`, "error");
        }
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleString();
    };

    const parseUA = (ua?: string) => {
        if (!ua) return null;
        if (ua.includes("Firefox")) return "Firefox";
        if (ua.includes("Chrome")) return "Chrome";
        if (ua.includes("Safari")) return "Safari";
        if (ua.includes("Postman")) return "Postman";
        if (ua.includes("Vercel")) return "Vercel Bot";
        return "Generic Browser";
    };

    return (
        <div className={`bg-white/5 border-white/10 rounded-xl border shadow-sm transition-colors duration-500 ${chainCompromised ? 'border-red-500/50 bg-red-500/5' : ''}`}>
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${chainCompromised ? 'bg-red-500/20' : 'bg-indigo-500/20'}`}>
                        {chainCompromised ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <Shield className="w-5 h-5 text-indigo-400" />}
                    </div>
                    <div>
                        <h2 className="font-bold text-zinc-100 flex items-center gap-2">
                            Audit Log
                            {chainCompromised && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">COMPROMISED</span>}
                            <ProBadge />
                        </h2>
                        <p className="text-sm text-gray-500">Track all documentation activities</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleVerifyIntegrity}
                        disabled={verifying}
                        className={`px-3 py-2 text-sm border rounded-lg flex items-center gap-2 transition-colors ${
                            chainCompromised 
                                ? "border-red-500 text-red-400 hover:bg-red-500/10" 
                                : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        }`}
                    >
                        {verifying ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Shield className="w-4 h-4" />}
                        {chainCompromised ? "Re-verify Chain" : "Verify Integrity"}
                    </button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-2 text-sm border rounded-lg flex items-center gap-2 ${showFilters ? "bg-indigo-500/20 border-indigo-500/30" : ""}`}
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                    </button>
                    <div className="flex rounded-lg overflow-hidden border border-indigo-600">
                        <button
                            onClick={() => handleExport('csv')}
                            className="px-3 py-2 text-sm bg-indigo-600 text-white flex items-center gap-2 hover:bg-indigo-700 border-r border-indigo-700"
                        >
                            <Download className="w-4 h-4" />
                            CSV
                        </button>
                        <button
                            onClick={() => handleExport('pdf')}
                            className="px-3 py-2 text-sm bg-indigo-600 text-white flex items-center gap-2 hover:bg-indigo-700"
                            title="Export Signed PDF"
                        >
                            <FileText className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <FeatureGateOverlay isLocked={false} title="Audit Logs Locked" description="Upgrade to the Pro plan to access detailed audit logs for compliance and security.">
                {/* Filters */}
                {showFilters && (
                    <div className="p-4 bg-white/5 border-b border-white/10 flex gap-4 flex-wrap">
                        <select
                            value={filters.action}
                            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                            className="px-3 py-2 border rounded-lg text-sm bg-white"
                        >
                            <option value="">All Actions</option>
                            <option value="CREATE">Create</option>
                            <option value="UPDATE">Update</option>
                            <option value="DELETE">Delete</option>
                            <option value="VIEW">View</option>
                            <option value="EXPORT">Export</option>
                            <option value="SIGN_IN">Sign In</option>
                            <option value="SIGN_UP">Sign Up</option>
                            <option value="VERIFY">Verify</option>
                            <option value="UPDATE">Update</option>
                            <option value="AI_ARCHITECT_QUERY">AI Architect</option>
                        </select>
                        <select
                            value={filters.entity}
                            onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
                            className="px-3 py-2 border rounded-lg text-sm bg-white"
                        >
                            <option value="">All Entities</option>
                            <option value="File">File</option>
                            <option value="Documentation">Documentation</option>
                            <option value="Team">Team</option>
                            <option value="Changelog">Changelog</option>
                        </select>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            className="px-3 py-2 border rounded-lg text-sm"
                        />
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            className="px-3 py-2 border rounded-lg text-sm"
                        />
                        <button
                            onClick={() => setFilters({ action: "", entity: "", startDate: "", endDate: "" })}
                            className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100"
                        >
                            Clear
                        </button>
                    </div>
                )}

                {/* Logs Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5 text-left text-sm text-zinc-400">
                            <tr>
                                <th className="px-4 py-3 font-medium">Timestamp</th>
                                <th className="px-4 py-3 font-medium">Action</th>
                                <th className="px-4 py-3 font-medium">Entity</th>
                                <th className="px-4 py-3 font-medium">Details</th>
                                <th className="px-4 py-3 font-medium">IP</th>
                                <th className="px-4 py-3 font-medium w-8"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        Loading...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        No audit logs found
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const Icon = ACTION_ICONS[log.action] || FileText;
                                    const color = ACTION_COLORS[log.action] || "bg-white/10 text-gray-300";

                                    return (
                                        <tr key={log.id} className="hover:bg-white/5">
                                            <td className="px-4 py-3 text-sm text-zinc-400">
                                                {formatDate(log.createdAt)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
                                                    <Icon className="w-3 h-3" />
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-zinc-100">
                                                {log.entity}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-zinc-400 max-w-xs truncate">
                                                {log.details ? JSON.stringify(log.details).slice(0, 50) : "-"}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                                                <div className="flex flex-col">
                                                    <span>{log.ip || "-"}</span>
                                                    <span className="text-[10px] opacity-50">{parseUA(typeof log.details?.ua === "string" ? log.details.ua : undefined) || "unknown"}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {integrityStatus[log.id] === true && (
                                                    <Shield className="w-4 h-4 text-emerald-500 animate-in zoom-in" />
                                                )}
                                                {integrityStatus[log.id] === false && (
                                                    <AlertTriangle className="w-4 h-4 text-red-500 animate-in shake" />
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                            Page {page} of {totalPages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 border rounded-lg disabled:opacity-50"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-2 border rounded-lg disabled:opacity-50"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </FeatureGateOverlay>
        </div>
    );
}

import { ProBadge } from "@/components/ui/pro-badge";
import { FeatureGateOverlay } from "@/components/ui/feature-gate-overlay";

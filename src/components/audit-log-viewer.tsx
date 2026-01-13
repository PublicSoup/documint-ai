"use client";

import { useState, useEffect } from "react";
import {
    Shield, Download, Filter, ChevronLeft, ChevronRight,
    FileText, Users, Trash2, Eye, Edit2, Upload, LogOut
} from "lucide-react";

interface AuditLog {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    details: any;
    ip: string | null;
    createdAt: string;
}

const ACTION_ICONS: Record<string, any> = {
    CREATE: Upload,
    UPDATE: Edit2,
    DELETE: Trash2,
    VIEW: Eye,
    EXPORT: Download,
    LOGIN: LogOut,
};

const ACTION_COLORS: Record<string, string> = {
    CREATE: "bg-green-100 text-green-700",
    UPDATE: "bg-blue-100 text-blue-700",
    DELETE: "bg-red-100 text-red-700",
    VIEW: "bg-gray-100 text-gray-700",
    EXPORT: "bg-purple-100 text-purple-700",
    GENERATE_CHANGELOG: "bg-amber-100 text-amber-700",
};

export default function AuditLogViewer() {
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

    const handleExport = async () => {
        try {
            const res = await fetch("/api/audit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ format: "csv", ...filters })
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleString();
    };

    return (
        <div className="bg-white rounded-xl border shadow-sm">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="font-bold text-gray-900">Audit Log</h2>
                        <p className="text-sm text-gray-500">Track all documentation activities</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-2 text-sm border rounded-lg flex items-center gap-2 ${showFilters ? "bg-indigo-50 border-indigo-200" : ""}`}
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                    </button>
                    <button
                        onClick={handleExport}
                        className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-700"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="p-4 bg-gray-50 border-b flex gap-4 flex-wrap">
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
                        className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Logs Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50 text-left text-sm text-gray-600">
                        <tr>
                            <th className="px-4 py-3 font-medium">Timestamp</th>
                            <th className="px-4 py-3 font-medium">Action</th>
                            <th className="px-4 py-3 font-medium">Entity</th>
                            <th className="px-4 py-3 font-medium">Details</th>
                            <th className="px-4 py-3 font-medium">IP</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                    Loading...
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                    No audit logs found
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => {
                                const Icon = ACTION_ICONS[log.action] || FileText;
                                const color = ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700";
                                return (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {formatDate(log.createdAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
                                                <Icon className="w-3 h-3" />
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900">
                                            {log.entity}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                                            {log.details ? JSON.stringify(log.details).slice(0, 50) : "-"}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                                            {log.ip || "-"}
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
        </div>
    );
}

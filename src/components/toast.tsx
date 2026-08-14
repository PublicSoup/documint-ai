"use client";

import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { CheckCircle2, AlertCircle, X, AlertTriangle } from "lucide-react";

interface ToastProps {
    id: string;
    message: string;
    type: "success" | "error" | "warning";
    onClose: (id: string) => void;
}

function Toast({ id, message, type, onClose }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose(id);
        }, type === "warning" ? 6000 : 3000); // Keep warnings longer
        return () => clearTimeout(timer);
    }, [id, onClose, type]);

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-bottom-5 fade-in duration-300 ${
            type === "success" ? "bg-white border-green-200 text-gray-800" : 
            type === "warning" ? "bg-white border-amber-200 text-gray-800" :
            "bg-white border-red-200 text-gray-800"
        }`}>
            {type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : type === "warning" ? (
                <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
            )}
            <span className="text-sm font-medium">{message}</span>
            <button onClick={() => onClose(id)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

interface ToastContextType {
    toast: (message: string, type?: "success" | "error" | "warning") => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "warning" }[]>([]);

    // Stable identities: consumers put `toast` in effect/callback dependency
    // arrays. A fresh function (or a fresh `{ toast }` value) every render makes
    // those deps change every render, which turns any effect that calls toast()
    // into an infinite render loop (see the IDE auto-open effect).
    const toast = useCallback((message: string, type: "success" | "error" | "warning" = "success") => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const value = useMemo(() => ({ toast }), [toast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map((t) => (
                    <Toast key={t.id} {...t} onClose={removeToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/toast";

export interface IDESettings {
    showSidebar: boolean;
    showAIChat: boolean;
    showTerminal: boolean;
    showAIEditor: boolean;
    showDocPreview: boolean;
    showLocalTopology: boolean;
    activeSidebarTab: "explorer" | "search" | "git";
    theme: "dark" | "light"; // Future proofing
}

const DEFAULT_SETTINGS: IDESettings = {
    showSidebar: true,
    showAIChat: true,
    showTerminal: true,
    showAIEditor: false,
    showDocPreview: false,
    showLocalTopology: false,
    activeSidebarTab: "explorer",
    theme: "dark"
};

export function useIDESettings() {
    const { toast } = useToast();
    const [settings, setSettings] = useState<IDESettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const initialLoadDone = useRef(false);

    // Fetch on mount
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch("/api/user/settings");
                if (res.ok) {
                    const data = await res.json();
                    if (data.settings && Object.keys(data.settings).length > 0) {
                        setSettings(prev => ({ ...prev, ...data.settings }));
                    }
                }
            } catch (error) {
                console.error("Failed to load settings", error);
            } finally {
                setLoading(false);
                initialLoadDone.current = true;
            }
        };
        fetchSettings();
    }, []);

    // Sync to backend on change (debounced)
    useEffect(() => {
        if (!initialLoadDone.current) return;

        const timeoutId = setTimeout(async () => {
            try {
                await fetch("/api/user/settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(settings)
                });
            } catch (error) {
                console.error("Failed to save settings", error);
            }
        }, 1000); // 1s debounce

        return () => clearTimeout(timeoutId);
    }, [settings]);

    const updateSetting = <K extends keyof IDESettings>(key: K, value: IDESettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return {
        settings,
        loading,
        updateSetting,
        setSettings // For bulk updates if needed
    };
}

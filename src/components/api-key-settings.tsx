"use client";

import React from "react";
import { Terminal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApiKeyManager } from "@/components/api-key-manager";

/**
 * Wrapper component for the API key settings card.
 * Renders the ApiKeyManager inside a styled card.
 */
export function ApiKeySettings() {
    return (
        <Card className="glass-card border-white/5">
            <CardHeader>
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-primary" />
                    AI & API Settings
                </CardTitle>
                <CardDescription>
                    Connect your own Google AI key to use AI features without plan limits
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ApiKeyManager />
            </CardContent>
        </Card>
    );
}
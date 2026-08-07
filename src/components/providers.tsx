"use client";

import { SessionProvider } from "next-auth/react";

import { ToastProvider } from "./toast";
import { ConfirmProvider } from "./ui/confirm-dialog";
import NativeBridge from "./native/native-bridge";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <ToastProvider>
                <ConfirmProvider>
                    <NativeBridge />
                    {children}
                </ConfirmProvider>
            </ToastProvider>
        </SessionProvider>
    );
}

"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./dialog";
import { Button } from "./button";

export interface ConfirmOptions {
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** "destructive" renders the confirm button in the danger style. */
    variant?: "default" | "destructive";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * In-app replacement for window.confirm(). Resolves true when the user
 * confirms, false when they cancel or dismiss the dialog.
 */
export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext);
    if (!confirm) {
        throw new Error("useConfirm must be used within a ConfirmProvider");
    }
    return confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolverRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback<ConfirmFn>((opts) => {
        return new Promise<boolean>((resolve) => {
            // Settle any confirm that is somehow still pending before replacing it.
            resolverRef.current?.(false);
            resolverRef.current = resolve;
            setOptions(opts);
        });
    }, []);

    const close = (result: boolean) => {
        resolverRef.current?.(result);
        resolverRef.current = null;
        setOptions(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Dialog open={!!options} onOpenChange={(open) => !open && close(false)}>
                <DialogContent className="glass-card border-white/10 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white">{options?.title}</DialogTitle>
                        <DialogDescription className="whitespace-pre-line">
                            {options?.description}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => close(false)}>
                            {options?.cancelLabel ?? "Cancel"}
                        </Button>
                        <Button
                            onClick={() => close(true)}
                            className={
                                options?.variant === "destructive"
                                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                                    : undefined
                            }
                        >
                            {options?.confirmLabel ?? "Confirm"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ConfirmContext.Provider>
    );
}

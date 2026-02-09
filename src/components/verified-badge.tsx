"use client";

import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
    status: "VERIFIED" | "OUTDATED" | "UNVERIFIED";
    verifiedBy?: string;
    verifiedAt?: string | Date;
    className?: string;
}

export function VerifiedBadge({ status, verifiedBy, verifiedAt, className }: VerifiedBadgeProps) {
    if (status === "UNVERIFIED") {
        return (
            <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/60 text-xs font-medium border border-white/10", className)}>
                <Clock className="w-3.5 h-3.5" />
                <span>Unverified</span>
            </div>
        );
    }

    if (status === "OUTDATED") {
        return (
            <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-medium border border-amber-500/20", className)}>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Outdated</span>
            </div>
        );
    }

    return (
        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs font-medium border border-emerald-500/20", className)}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <div className="flex flex-col leading-none gap-0.5">
                <span>Verified</span>
                {verifiedBy && verifiedAt && (
                    <span className="text-[10px] opacity-80 font-normal">
                        by {verifiedBy} on {new Date(verifiedAt).toLocaleDateString()}
                    </span>
                )}
            </div>
        </div>
    );
}

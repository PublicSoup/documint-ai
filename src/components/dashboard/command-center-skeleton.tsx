"use client";

export function CommandCenterSkeleton() {
    return (
        <div className="space-y-5 animate-pulse">
            {/* Summary bar */}
            <div className="h-[72px] rounded-2xl bg-white/[0.03] border border-white/[0.06]" />

            {/* Continue working */}
            <div className="h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06]" />

            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-2xl bg-white/[0.03] border border-white/[0.06]" />
                ))}
            </div>

            {/* AI Queue + Recent */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-[240px] rounded-2xl bg-white/[0.03] border border-white/[0.06]" />
                <div className="h-[240px] rounded-2xl bg-white/[0.03] border border-white/[0.06]" />
            </div>

            {/* Hotspots */}
            <div className="h-[180px] rounded-2xl bg-white/[0.03] border border-white/[0.06]" />

            {/* Health */}
            <div className="h-[100px] rounded-2xl bg-white/[0.03] border border-white/[0.06]" />
        </div>
    );
}
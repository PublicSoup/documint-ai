"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface UsageData {
    filesProcessed: number;
    filesLimit: number;
    plan: string;
}

export default function UsageMeter() {
    const [usage, setUsage] = useState<UsageData | null>(null);

    useEffect(() => {
        fetch("/api/usage")
            .then(res => res.json())
            .then(data => setUsage(data))
            .catch(() => { });
    }, []);

    if (!usage) return null;

    const percentage = Math.min((usage.filesProcessed / usage.filesLimit) * 100, 100);
    const isNearLimit = percentage >= 80;
    const isAtLimit = percentage >= 100;

    return (
        <div className={`p-4 rounded-xl border ${isAtLimit ? 'bg-red-50 border-red-200' : isNearLimit ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                    {usage.plan} Plan
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${isAtLimit ? 'bg-red-100 text-red-700' :
                        isNearLimit ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-200 text-gray-600'
                    }`}>
                    {usage.filesProcessed} / {usage.filesLimit} files
                </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full transition-all ${isAtLimit ? 'bg-red-500' :
                            isNearLimit ? 'bg-amber-500' :
                                'bg-green-500'
                        }`}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {isNearLimit && (
                <div className="mt-3">
                    <Link
                        href="/dashboard/billing"
                        className={`block text-center text-xs font-medium py-2 px-3 rounded-lg transition-colors ${isAtLimit
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-amber-500 hover:bg-amber-600 text-white'
                            }`}
                    >
                        {isAtLimit ? '⚠️ Limit Reached - Upgrade Now' : '🚀 Upgrade for More'}
                    </Link>
                </div>
            )}
        </div>
    );
}

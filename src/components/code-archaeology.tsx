"use client";

import { useState } from "react";
import { Shovel, Clock, Calendar, AlertTriangle, ArrowRight, Loader2, Sparkles } from "lucide-react";

interface ArchaeologyReport {
    era: string;
    fossils: string[];
    stratigraphy: string;
    techDebtScore: number;
    refactoringPlan: string[];
}

interface CodeArchaeologyProps {
    fileId: string;
    fileName: string;
}

export default function CodeArchaeology({ fileId, fileName }: CodeArchaeologyProps) {
    const [report, setReport] = useState<ArchaeologyReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startExcavation = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/archaeology", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId }),
            });

            if (!res.ok) throw new Error("Excavation failed");

            const data = await res.json();
            setReport(data);
        } catch (err) {
            setError("Failed to analyze code history. The fossil record is incomplete.");
        } finally {
            setLoading(false);
        }
    };

    if (!report && !loading) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shovel className="w-8 h-8 text-amber-700" />
                </div>
                <h3 className="text-xl font-bold text-amber-900 mb-2">Code Archaeology Mode</h3>
                <p className="text-amber-800/70 mb-6 max-w-md mx-auto">
                    Analyze this file for historical patterns, fossilized code, and technical debt layers.
                </p>
                <button
                    onClick={startExcavation}
                    className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium inline-flex items-center gap-2 transition-colors shadow-sm"
                >
                    <Shovel className="w-4 h-4" />
                    Start Excavation
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-12 text-center">
                <Loader2 className="w-10 h-10 text-amber-600 animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-medium text-amber-900">Excavating code strata...</h3>
                <p className="text-sm text-amber-700 mt-2">Analyzing historical patterns and coding styles...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                {error}
                <button onClick={startExcavation} className="block mx-auto mt-4 text-sm underline hover:text-red-800">
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                    <Shovel className="w-6 h-6" />
                    <h3 className="text-xl font-bold">Excavation Report: {fileName}</h3>
                </div>
                <div className="flex items-center gap-2 opacity-90 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>Estimated Era: <strong>{report?.era}</strong></span>
                </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Strata & Score */}
                <div className="space-y-6">
                    <div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Stratigraphic Analysis</h4>
                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg text-amber-900 text-sm leading-relaxed">
                            {report?.stratigraphy}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Modernity Score</h4>
                        <div className="flex items-center gap-4">
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200" />
                                    <circle
                                        cx="48" cy="48" r="40"
                                        stroke="currentColor" strokeWidth="8" fill="transparent"
                                        className={`${(report?.techDebtScore || 0) > 70 ? 'text-green-500' : (report?.techDebtScore || 0) > 40 ? 'text-amber-500' : 'text-red-500'}`}
                                        strokeDasharray={`${(report?.techDebtScore || 0) * 2.51} 251`}
                                    />
                                </svg>
                                <span className="absolute text-2xl font-bold text-gray-700">{report?.techDebtScore}</span>
                            </div>
                            <div className="text-sm text-gray-600">
                                <p className="font-medium">Condition: {
                                    (report?.techDebtScore || 0) > 80 ? 'Pristine' :
                                        (report?.techDebtScore || 0) > 60 ? 'Weathered' :
                                            (report?.techDebtScore || 0) > 40 ? 'Ancient' : 'Ruins'
                                }</p>
                                <p>Higher is more modern.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Fossils & Plan */}
                <div className="space-y-6">
                    <div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Identified Fossils
                        </h4>
                        {report?.fossils && report.fossils.length > 0 ? (
                            <ul className="space-y-2">
                                {report.fossils.map((fossil, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                        {fossil}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 italic">No fossilized code detected.</p>
                        )}
                    </div>

                    <div>
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Restoration Plan
                        </h4>
                        <ol className="space-y-3">
                            {report?.refactoringPlan.map((step, i) => (
                                <li key={i} className="flex gap-3 text-sm text-gray-700">
                                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">
                                        {i + 1}
                                    </span>
                                    <span>{step}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}

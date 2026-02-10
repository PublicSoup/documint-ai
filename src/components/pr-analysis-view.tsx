import { AlertTriangle, CheckCircle, Info, ShieldAlert, XCircle } from "lucide-react";

interface Suggestion {
    file: string;
    line: number;
    comment: string;
}

interface PRAnalysisData {
    summary: string;
    impactScore: number;
    breakingChanges: string[];
    suggestions: Suggestion[];
    securityIssues: string[];
}

interface PRAnalysisViewProps {
    data: PRAnalysisData | string;
}

export function PRAnalysisView({ data }: PRAnalysisViewProps) {
    // Handle case where data might still be a raw string (legacy or error)
    const analysis: PRAnalysisData = typeof data === 'string' ? {
        summary: data,
        impactScore: 0,
        breakingChanges: [],
        suggestions: [],
        securityIssues: []
    } : data;

    const getScoreColor = (score: number) => {
        if (score >= 80) return "text-red-500";
        if (score >= 50) return "text-yellow-500";
        return "text-green-500";
    };

    const scoreColor = getScoreColor(analysis.impactScore);

    return (
        <div className="space-y-4 p-4 bg-white/5 border-white/10 rounded-lg border border-gray-200 shadow-sm">
            {/* Header / Score */}
            <div className="flex items-start justify-between">
                <div>
                    <h4 className="font-semibold text-zinc-100">AI Change Impact Report</h4>
                    <p className="text-sm text-zinc-400 mt-1">{analysis.summary}</p>
                </div>
                <div className="flex flex-col items-center">
                    <div className={`text-3xl font-bold ${scoreColor}`}>
                        {analysis.impactScore}
                    </div>
                    <span className="text-xs text-gray-500 uppercase tracking-wide">Impact Score</span>
                </div>
            </div>

            <div className="border-t border-gray-100 my-4" />

            {/* Breaking Changes */}
            {analysis.breakingChanges && Array.isArray(analysis.breakingChanges) && analysis.breakingChanges.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h5 className="flex items-center gap-2 text-sm font-semibold text-red-800 mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        Potential Breaking Changes
                    </h5>
                    <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                        {analysis.breakingChanges.map((change, idx) => (
                            <li key={idx}>{change}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Security Issues */}
            {analysis.securityIssues && Array.isArray(analysis.securityIssues) && analysis.securityIssues.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <h5 className="flex items-center gap-2 text-sm font-semibold text-orange-800 mb-2">
                        <ShieldAlert className="w-4 h-4" />
                        Security Warnings
                    </h5>
                    <ul className="list-disc list-inside text-sm text-orange-700 space-y-1">
                        {analysis.securityIssues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Suggestions */}
            {analysis.suggestions && Array.isArray(analysis.suggestions) && analysis.suggestions.length > 0 && (
                <div>
                    <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Code Improvement Suggestions
                    </h5>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {analysis.suggestions.map((suggestion, idx) => (
                            <div key={idx} className="text-sm bg-white/5 p-3 rounded border border-gray-200">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span className="font-mono">{suggestion.file}</span>
                                    <span>Line {suggestion.line}</span>
                                </div>
                                <p className="text-zinc-200">{suggestion.comment}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {analysis.breakingChanges.length === 0 && analysis.securityIssues.length === 0 && analysis.suggestions.length === 0 && (
                <div className="text-center py-4 text-green-600 flex flex-col items-center gap-2">
                    <CheckCircle className="w-8 h-8 opacity-50" />
                    <p className="text-sm">No critical issues detected.</p>
                </div>
            )}
        </div>
    );
}

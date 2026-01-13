import React from 'react';
import { AlertCircle, CheckCircle, Info, Activity, Zap } from 'lucide-react';

const AnalysisPanel = ({ results, isLoading }) => {
    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                <p className="animate-pulse">Analyzing your code...</p>
            </div>
        );
    }

    if (!results) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                <Zap className="w-12 h-12 opacity-20" />
                <p>Run analysis to see AI insights here.</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto pr-2 space-y-6">
            {/* Summary Section */}
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h3 className="text-indigo-400 font-semibold mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Summary
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed">{results.summary}</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/50">
                    <span className="text-slate-400 text-xs uppercase tracking-wider">Complexity</span>
                    <div className="flex items-end gap-2 mt-1">
                        <span className={`text-2xl font-bold ${results.complexity_score > 7 ? 'text-red-400' :
                                results.complexity_score > 4 ? 'text-yellow-400' : 'text-green-400'
                            }`}>
                            {results.complexity_score}
                        </span>
                        <span className="text-slate-500 text-sm mb-1">/ 10</span>
                    </div>
                </div>
            </div>

            {/* Suggestions List */}
            <div className="space-y-3">
                <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Suggestions</h3>
                {results.suggestions.map((suggestion, idx) => (
                    <div key={idx} className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-colors">
                        <div className="flex items-start gap-3">
                            {suggestion.severity === 'critical' ? <AlertCircle className="w-5 h-5 text-red-400 shrink-0" /> :
                                suggestion.severity === 'warning' ? <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" /> :
                                    <Info className="w-5 h-5 text-blue-400 shrink-0" />}

                            <div>
                                <p className="text-slate-200 text-sm font-medium mb-1">{suggestion.message}</p>
                                <div className="bg-black/30 rounded p-2 mt-2 font-mono text-xs text-slate-300 border-l-2 border-indigo-500/50">
                                    {suggestion.suggestion}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AnalysisPanel;

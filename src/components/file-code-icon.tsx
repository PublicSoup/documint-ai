export default function FileCodeIcon({ language }: { language: string }) {
    const langConfig: Record<string, { color: string; bg: string; label: string }> = {
        // Python
        python: { color: "text-amber-400", bg: "bg-amber-400/10", label: "PY" },
        py: { color: "text-amber-400", bg: "bg-amber-400/10", label: "PY" },

        // JavaScript
        javascript: { color: "text-yellow-400", bg: "bg-yellow-400/10", label: "JS" },
        js: { color: "text-yellow-400", bg: "bg-yellow-400/10", label: "JS" },
        jsx: { color: "text-yellow-400", bg: "bg-yellow-400/10", label: "JSX" },

        // TypeScript
        typescript: { color: "text-blue-400", bg: "bg-blue-400/10", label: "TS" },
        ts: { color: "text-blue-400", bg: "bg-blue-400/10", label: "TS" },
        tsx: { color: "text-blue-400", bg: "bg-blue-400/10", label: "TSX" },

        // Go
        go: { color: "text-cyan-400", bg: "bg-cyan-400/10", label: "GO" },

        // Rust
        rust: { color: "text-orange-400", bg: "bg-orange-400/10", label: "RS" },
        rs: { color: "text-orange-400", bg: "bg-orange-400/10", label: "RS" },

        // Java
        java: { color: "text-red-400", bg: "bg-red-400/10", label: "JV" },

        // C#
        csharp: { color: "text-purple-400", bg: "bg-purple-400/10", label: "C#" },
        cs: { color: "text-purple-400", bg: "bg-purple-400/10", label: "C#" },

        // C++
        cpp: { color: "text-blue-500", bg: "bg-blue-500/10", label: "C+" },
        c: { color: "text-blue-500", bg: "bg-blue-500/10", label: "C" },

        // Ruby
        ruby: { color: "text-red-500", bg: "bg-red-500/10", label: "RB" },
        rb: { color: "text-red-500", bg: "bg-red-500/10", label: "RB" },

        // PHP
        php: { color: "text-indigo-400", bg: "bg-indigo-400/10", label: "HP" },
    };

    const config = langConfig[language.toLowerCase()] || { color: "text-white/60", bg: "bg-white/10", label: language.slice(0, 2).toUpperCase() };

    return (
        <div className={`w-8 h-8 rounded-lg ${config.bg} border border-white/5 flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <span className={`text-[10px] font-bold ${config.color} tracking-tighter`}>{config.label}</span>
        </div>
    );
}

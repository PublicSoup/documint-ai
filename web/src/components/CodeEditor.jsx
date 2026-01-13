import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

// Supported languages with their Monaco IDs and file extensions
const LANGUAGES = [
    { id: 'python', name: 'Python', extensions: ['.py'], icon: '🐍' },
    { id: 'javascript', name: 'JavaScript', extensions: ['.js', '.jsx'], icon: '🟨' },
    { id: 'typescript', name: 'TypeScript', extensions: ['.ts', '.tsx'], icon: '🔷' },
    { id: 'java', name: 'Java', extensions: ['.java'], icon: '☕' },
    { id: 'csharp', name: 'C#', extensions: ['.cs'], icon: '🟣' },
    { id: 'cpp', name: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp'], icon: '🔵' },
    { id: 'c', name: 'C', extensions: ['.c', '.h'], icon: '⚪' },
    { id: 'go', name: 'Go', extensions: ['.go'], icon: '🐹' },
    { id: 'rust', name: 'Rust', extensions: ['.rs'], icon: '🦀' },
    { id: 'ruby', name: 'Ruby', extensions: ['.rb'], icon: '💎' },
    { id: 'php', name: 'PHP', extensions: ['.php'], icon: '🐘' },
    { id: 'swift', name: 'Swift', extensions: ['.swift'], icon: '🍎' },
    { id: 'kotlin', name: 'Kotlin', extensions: ['.kt', '.kts'], icon: '🟠' },
    { id: 'scala', name: 'Scala', extensions: ['.scala'], icon: '🔴' },
    { id: 'html', name: 'HTML', extensions: ['.html', '.htm'], icon: '🌐' },
    { id: 'css', name: 'CSS', extensions: ['.css'], icon: '🎨' },
    { id: 'json', name: 'JSON', extensions: ['.json'], icon: '📋' },
    { id: 'yaml', name: 'YAML', extensions: ['.yml', '.yaml'], icon: '📄' },
    { id: 'sql', name: 'SQL', extensions: ['.sql'], icon: '🗃️' },
    { id: 'shell', name: 'Shell', extensions: ['.sh', '.bash'], icon: '🐚' },
];

// Auto-detect language from code content
const detectLanguage = (code) => {
    if (!code || code.trim().length === 0) return 'python';

    const patterns = [
        // Python
        { lang: 'python', patterns: [/^import\s+\w+/m, /^from\s+\w+\s+import/m, /def\s+\w+\s*\(/m, /if\s+__name__\s*==\s*['"]__main__['"]/m, /^\s*class\s+\w+.*:/m] },
        // JavaScript/TypeScript
        { lang: 'javascript', patterns: [/^const\s+\w+\s*=/m, /^let\s+\w+\s*=/m, /^var\s+\w+\s*=/m, /=>\s*{/m, /function\s+\w+\s*\(/m, /import\s+.*\s+from\s+['"]/m, /require\s*\(['"]/m] },
        { lang: 'typescript', patterns: [/:\s*(string|number|boolean|any|void)\s*[;=]/m, /interface\s+\w+/m, /<\w+>/m] },
        // Java
        { lang: 'java', patterns: [/public\s+class\s+\w+/m, /private\s+\w+\s+\w+/m, /System\.out\.print/m, /public\s+static\s+void\s+main/m] },
        // C#
        { lang: 'csharp', patterns: [/using\s+System/m, /namespace\s+\w+/m, /Console\.Write/m] },
        // C/C++
        { lang: 'cpp', patterns: [/#include\s*<\w+>/m, /std::/m, /cout\s*<</m, /cin\s*>>/m] },
        { lang: 'c', patterns: [/#include\s*<stdio\.h>/m, /#include\s*<stdlib\.h>/m, /printf\s*\(/m] },
        // Go
        { lang: 'go', patterns: [/^package\s+\w+/m, /func\s+\w+\s*\(/m, /fmt\.Print/m] },
        // Rust
        { lang: 'rust', patterns: [/fn\s+\w+\s*\(/m, /let\s+mut\s+/m, /println!\s*\(/m, /use\s+\w+::/m] },
        // Ruby
        { lang: 'ruby', patterns: [/^require\s+['"]/m, /def\s+\w+\s*$/m, /end$/m, /puts\s+/m] },
        // PHP
        { lang: 'php', patterns: [/<\?php/m, /\$\w+\s*=/m, /echo\s+/m] },
        // HTML
        { lang: 'html', patterns: [/<!DOCTYPE\s+html>/i, /<html/i, /<head>/i, /<body>/i] },
        // CSS
        { lang: 'css', patterns: [/[.#]?\w+\s*{\s*[\w-]+\s*:/m, /@media\s+/m, /@import\s+/m] },
        // JSON
        { lang: 'json', patterns: [/^\s*{\s*"\w+"\s*:/m, /^\s*\[\s*{/m] },
        // YAML
        { lang: 'yaml', patterns: [/^\w+:\s*$/m, /^\s+-\s+\w+:/m] },
        // SQL
        { lang: 'sql', patterns: [/SELECT\s+.*\s+FROM/i, /INSERT\s+INTO/i, /CREATE\s+TABLE/i] },
        // Shell
        { lang: 'shell', patterns: [/^#!/m, /echo\s+/m, /\$\(/m] },
    ];

    for (const { lang, patterns: langPatterns } of patterns) {
        for (const pattern of langPatterns) {
            if (pattern.test(code)) {
                return lang;
            }
        }
    }

    return 'python'; // Default fallback
};

const CodeEditor = ({ code, onChange, language, onLanguageChange }) => {
    const editorRef = useRef(null);
    const isAutoDetecting = useRef(true);

    // Auto-detect language when code changes
    useEffect(() => {
        if (isAutoDetecting.current && code) {
            const detected = detectLanguage(code);
            if (detected !== language && onLanguageChange) {
                onLanguageChange(detected);
            }
        }
    }, [code]);

    const handleEditorMount = (editor) => {
        editorRef.current = editor;
    };

    const handleLanguageSelect = (newLang) => {
        isAutoDetecting.current = false; // Stop auto-detecting once user selects
        onLanguageChange(newLang);
    };

    const currentLang = LANGUAGES.find(l => l.id === language) || LANGUAGES[0];

    return (
        <div className="h-full w-full flex flex-col">
            {/* Language Selector */}
            <div className="h-10 bg-slate-800/50 border-b border-slate-700/50 flex items-center px-4 gap-3">
                <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                </div>

                <div className="h-4 w-px bg-slate-700"></div>

                {/* Language Dropdown */}
                <div className="relative group">
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-all">
                        <span>{currentLang.icon}</span>
                        <span>{currentLang.name}</span>
                        <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {/* Dropdown Menu */}
                    <div className="absolute invisible group-hover:visible opacity-0 group-hover:opacity-100 top-full left-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 transition-all max-h-80 overflow-y-auto">
                        {LANGUAGES.map((lang) => (
                            <button
                                key={lang.id}
                                onClick={() => handleLanguageSelect(lang.id)}
                                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors ${lang.id === language
                                        ? 'bg-indigo-500/20 text-indigo-300'
                                        : 'text-slate-300 hover:bg-slate-700/50'
                                    }`}
                            >
                                <span>{lang.icon}</span>
                                <span>{lang.name}</span>
                                {lang.id === language && (
                                    <svg className="w-4 h-4 ml-auto text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <span className="text-xs text-slate-500 ml-auto">
                    {isAutoDetecting.current ? '✨ Auto-detected' : ''}
                </span>
            </div>

            {/* Monaco Editor */}
            <div className="flex-1">
                <Editor
                    height="100%"
                    language={language}
                    value={code}
                    onChange={onChange}
                    onMount={handleEditorMount}
                    theme="vs-dark"
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                        lineNumbers: 'on',
                        renderLineHighlight: 'all',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 4,
                        wordWrap: 'on',
                        padding: { top: 16, bottom: 16 },
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        smoothScrolling: true,
                        bracketPairColorization: { enabled: true },
                    }}
                />
            </div>
        </div>
    );
};

export { LANGUAGES, detectLanguage };
export default CodeEditor;

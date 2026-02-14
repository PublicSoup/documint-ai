"use client";

import React, { useState } from "react";
import { Sparkles, Code, Server, Layout, Palette, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectTemplate {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    files: { name: string; content: string }[];
    tags: string[];
}

const TEMPLATES: ProjectTemplate[] = [
    {
        id: "react-app",
        name: "React + Vite",
        description: "Modern React app with Vite bundler, hot reload, and TypeScript",
        icon: <Layout className="w-6 h-6" />,
        color: "from-cyan-500 to-blue-500",
        tags: ["Frontend", "React", "TypeScript"],
        files: [
            {
                name: "index.html",
                content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
</body>
</html>`
            },
            {
                name: "src/main.tsx",
                content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);`
            },
            {
                name: "src/App.tsx",
                content: `import { useState } from 'react';

export default function App() {
    const [count, setCount] = useState(0);

    return (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
            <h1>Hello from React ⚛️</h1>
            <p>Count: {count}</p>
            <button onClick={() => setCount(c => c + 1)}>Increment</button>
        </div>
    );
}`
            },
            {
                name: "src/index.css",
                content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e5e5e5; }
button { padding: 0.5rem 1rem; border-radius: 6px; border: none; background: #6366f1; color: white; cursor: pointer; }
button:hover { background: #5558dd; }`
            },
            {
                name: "package.json",
                content: JSON.stringify({
                    name: "react-app",
                    private: true,
                    type: "module",
                    scripts: { dev: "vite", build: "vite build" },
                    dependencies: { react: "^18.2.0", "react-dom": "^18.2.0" },
                    devDependencies: { "@types/react": "^18.2.0", "@vitejs/plugin-react": "^4.0.0", typescript: "^5.0.0", vite: "^5.0.0" }
                }, null, 2)
            },
        ]
    },
    {
        id: "express-api",
        name: "Express API",
        description: "RESTful API with Express.js, middleware, and JSON responses",
        icon: <Server className="w-6 h-6" />,
        color: "from-emerald-500 to-green-500",
        tags: ["Backend", "Node.js", "REST"],
        files: [
            {
                name: "index.js",
                content: `const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

let items = [
    { id: 1, name: 'Item 1', done: false },
    { id: 2, name: 'Item 2', done: true },
];

app.get('/api/items', (req, res) => {
    res.json({ items, count: items.length });
});

app.post('/api/items', (req, res) => {
    const item = { id: Date.now(), ...req.body, done: false };
    items.push(item);
    res.status(201).json(item);
});

app.listen(PORT, () => console.log(\`🚀 API running on http://localhost:\${PORT}\`));`
            },
            {
                name: "package.json",
                content: JSON.stringify({
                    name: "express-api",
                    private: true,
                    scripts: { dev: "node index.js", start: "node index.js" },
                    dependencies: { express: "^4.18.2" }
                }, null, 2)
            },
        ]
    },
    {
        id: "vanilla-html",
        name: "HTML + CSS + JS",
        description: "Simple static site with vanilla HTML, CSS, and JavaScript",
        icon: <Code className="w-6 h-6" />,
        color: "from-orange-500 to-amber-500",
        tags: ["Static", "Beginner", "No Build"],
        files: [
            {
                name: "index.html",
                content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Website</title>
    <link rel="stylesheet" href="style.css" />
</head>
<body>
    <header>
        <h1>Welcome to My Website 🎨</h1>
        <p>Built with vanilla HTML, CSS, and JavaScript</p>
    </header>
    <main>
        <div class="card">
            <h2>Getting Started</h2>
            <p>Edit these files to build your website.</p>
            <button id="btn" onclick="handleClick()">Click Me</button>
            <p id="output"></p>
        </div>
    </main>
    <script src="script.js"></script>
</body>
</html>`
            },
            {
                name: "style.css",
                content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: #e5e5e5; min-height: 100vh; }
header { text-align: center; padding: 3rem 1rem; }
h1 { font-size: 2.5rem; background: linear-gradient(90deg, #f59e0b, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
main { max-width: 600px; margin: 0 auto; padding: 1rem; }
.card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 2rem; }
button { padding: 0.5rem 1.5rem; border: none; border-radius: 8px; background: #6366f1; color: white; cursor: pointer; font-size: 1rem; margin-top: 1rem; }
button:hover { background: #5558dd; transform: translateY(-1px); transition: all 0.2s; }
#output { margin-top: 1rem; font-style: italic; color: #a78bfa; }`
            },
            {
                name: "script.js",
                content: `let clicks = 0;

function handleClick() {
    clicks++;
    const output = document.getElementById('output');
    output.textContent = \`You clicked \${clicks} time\${clicks !== 1 ? 's' : ''}! 🎉\`;
}`
            },
        ]
    },
    {
        id: "tailwind-landing",
        name: "Landing Page",
        description: "Beautiful landing page with Tailwind CSS and smooth animations",
        icon: <Palette className="w-6 h-6" />,
        color: "from-purple-500 to-pink-500",
        tags: ["Marketing", "Tailwind", "Landing"],
        files: [
            {
                name: "index.html",
                content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Product Landing</title>
    <link rel="stylesheet" href="style.css" />
</head>
<body>
    <nav>
        <div class="logo">🚀 ProductName</div>
        <div class="nav-links">
            <a href="#">Features</a>
            <a href="#">Pricing</a>
            <a href="#" class="cta-btn">Get Started</a>
        </div>
    </nav>
    <section class="hero">
        <h1>Build Something<br/><span class="gradient-text">Amazing</span></h1>
        <p>The modern platform for developers who want to ship faster and build better products.</p>
        <div class="hero-actions">
            <a href="#" class="btn-primary">Start Free Trial</a>
            <a href="#" class="btn-secondary">Watch Demo →</a>
        </div>
    </section>
</body>
</html>`
            },
            {
                name: "style.css",
                content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', system-ui, sans-serif; background: #030014; color: #e5e5e5; }
nav { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 3rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
.logo { font-size: 1.25rem; font-weight: 700; }
.nav-links { display: flex; align-items: center; gap: 2rem; }
.nav-links a { color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.875rem; }
.nav-links a:hover { color: white; }
.cta-btn { background: #6366f1 !important; color: white !important; padding: 0.5rem 1.25rem; border-radius: 8px; }
.hero { text-align: center; padding: 8rem 2rem 4rem; max-width: 800px; margin: 0 auto; }
h1 { font-size: 4rem; font-weight: 800; line-height: 1.1; margin-bottom: 1.5rem; }
.gradient-text { background: linear-gradient(135deg, #6366f1, #a855f7, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.hero p { font-size: 1.25rem; color: rgba(255,255,255,0.5); max-width: 600px; margin: 0 auto 2rem; line-height: 1.6; }
.hero-actions { display: flex; justify-content: center; gap: 1rem; }
.btn-primary { background: #6366f1; color: white; padding: 0.75rem 2rem; border-radius: 10px; text-decoration: none; font-weight: 600; }
.btn-primary:hover { background: #5558dd; transform: translateY(-2px); transition: all 0.2s; box-shadow: 0 0 30px rgba(99,102,241,0.3); }
.btn-secondary { color: rgba(255,255,255,0.7); padding: 0.75rem 2rem; text-decoration: none; font-weight: 500; }
.btn-secondary:hover { color: white; }`
            },
        ]
    },
];

interface ProjectTemplatesProps {
    onSelectTemplate: (files: { name: string; content: string }[]) => void;
}

export function ProjectTemplates({ onSelectTemplate }: ProjectTemplatesProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSelect = async (template: ProjectTemplate) => {
        setSelectedId(template.id);
        setLoading(true);

        // Small delay to show the selection animation
        await new Promise(resolve => setTimeout(resolve, 500));

        onSelectTemplate(template.files);
        setLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-[#020010]">
            <div className="max-w-3xl w-full">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
                        <Sparkles className="w-3 h-3" />
                        Starter Templates
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Start a New Project</h2>
                    <p className="text-sm text-white/40">Choose a template to get started instantly</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {TEMPLATES.map(template => (
                        <button
                            key={template.id}
                            onClick={() => handleSelect(template)}
                            disabled={loading}
                            className={cn(
                                "text-left p-5 rounded-xl border transition-all duration-300 group relative overflow-hidden",
                                selectedId === template.id
                                    ? "border-primary/50 bg-primary/10 scale-[0.98]"
                                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
                            )}
                        >
                            {/* Gradient glow on hover */}
                            <div className={cn(
                                "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br",
                                template.color
                            )} style={{ opacity: 0.03 }} />

                            <div className="relative z-10 flex items-start gap-4">
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br",
                                    template.color,
                                    "text-white shadow-lg"
                                )}>
                                    {selectedId === template.id && loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : selectedId === template.id ? (
                                        <CheckCircle2 className="w-5 h-5" />
                                    ) : (
                                        template.icon
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-white text-sm mb-1 flex items-center gap-2">
                                        {template.name}
                                        <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 group-hover:translate-x-1 transition-all" />
                                    </h3>
                                    <p className="text-xs text-white/40 line-clamp-2">{template.description}</p>
                                    <div className="flex gap-1.5 mt-2">
                                        {template.tags.map(tag => (
                                            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/30 font-medium">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

"use client";

import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";

interface GenerateReadmeButtonProps {
    fileIds: string[];
}

import { useToast } from "./toast";

export default function GenerateReadmeButton({ fileIds }: GenerateReadmeButtonProps) {
    const { toast } = useToast();
    const [generating, setGenerating] = useState(false);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const res = await fetch("/api/generate-readme", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileIds }),
            });
            if (res.ok) {
                const data = await res.json();
                // Download the README
                const blob = new Blob([data.readme], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "README.md";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast("README generated successfully!", "success");
            } else {
                toast("Failed to generate README", "error");
            }
        } catch {
            toast("Error generating README", "error");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="mt-4 pt-4 border-t">
            <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-70"
            >
                {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <BookOpen className="w-4 h-4" />
                )}
                {generating ? "Generating..." : "Generate README"}
            </button>
        </div>
    );
}

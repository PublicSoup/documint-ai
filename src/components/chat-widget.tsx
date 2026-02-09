"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Bot, User, Loader2, Sparkles, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
    role: "user" | "assistant";
    content: string;
}

export function ChatWidget({ contextFileId }: { contextFileId?: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: "assistant", content: "Hi! I'm your Codebase Assistant. Ask me anything about your docs or code." }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: userMsg }]);
        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMsg,
                    contextFileId
                })
            });

            const data = await res.json();

            if (res.ok) {
                setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
            } else {
                setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error." }]);
            }
        } catch (e) {
            setMessages(prev => [...prev, { role: "assistant", content: "Network error. Is the AI running?" }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
            {isOpen && (
                <div className="mb-4 w-[350px] md:w-[400px] h-[550px] glass-card border-none flex flex-col animate-slide-up overflow-hidden rounded-2xl shadow-2xl shadow-black/50">
                    {/* Header */}
                    <div className="bg-primary/20 backdrop-blur-md p-4 flex justify-between items-center border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-primary/20 border border-primary/20">
                                <Bot className="w-5 h-5 text-primary-foreground" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-white">Code Assistant</h3>
                                <p className="text-[10px] text-primary-foreground/80 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> Context-Aware AI
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsOpen(false)}
                            className="h-8 w-8 text-white/50 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/40 custom-scrollbar">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/10 ${m.role === "user" ? "bg-primary/20 text-primary" : "bg-black/40 text-green-400"
                                    }`}>
                                    {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                </div>
                                <div className={`p-3 rounded-2xl text-sm max-w-[80%] shadow-lg ${m.role === "user"
                                    ? "bg-primary text-white rounded-tr-none"
                                    : "bg-white/10 border border-white/5 text-gray-100 rounded-tl-none backdrop-blur-sm"
                                    }`}>
                                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                                    <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
                                </div>
                                <div className="bg-white/10 border border-white/5 p-3 rounded-2xl rounded-tl-none">
                                    <span className="text-xs text-white/50 flex items-center gap-1">
                                        Thinking <span className="animate-pulse">...</span>
                                    </span>
                                </div>
                            </div>
                        )}
                        {contextFileId && messages.length === 1 && (
                            <div className="flex justify-center my-2">
                                <span className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full border border-primary/20 flex items-center gap-1">
                                    <Code className="w-3 h-3" /> File Context Active
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="p-4 bg-black/60 border-t border-white/5 backdrop-blur-md">
                        <div className="relative flex items-center">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                placeholder="Ask about the code..."
                                className="w-full pl-4 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-white/20"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || loading}
                                className="absolute right-2 p-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary transition-colors shadow-lg shadow-primary/20"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center group transition-all duration-300 relative overflow-hidden",
                    isOpen
                        ? "bg-red-500/80 hover:bg-red-600 rotate-90"
                        : "bg-primary hover:bg-primary/90 hover:scale-110"
                )}
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
                {isOpen ? (
                    <X className="w-6 h-6 text-white" />
                ) : (
                    <MessageSquare className="w-6 h-6 text-white group-hover:animate-pulse" />
                )}
            </button>
        </div>
    );
}

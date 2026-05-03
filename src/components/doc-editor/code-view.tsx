import { Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CodeViewProps {
    fileName: string;
    rawContent: string | null;
    setRawContent: (val: string) => void;
    loadingRaw: boolean;
    isSavingCode: boolean;
    handleSaveCode: () => void;
    chatHistory: any[];
    sendingChat: boolean;
    chatInput: string;
    setChatInput: (val: string) => void;
    handleSendChat: () => void;
    messagesEndRef: React.RefObject<HTMLDivElement>;
}

export function CodeView({
    fileName,
    rawContent,
    setRawContent,
    loadingRaw,
    isSavingCode,
    handleSaveCode,
    chatHistory,
    sendingChat,
    chatInput,
    setChatInput,
    handleSendChat,
    messagesEndRef
}: CodeViewProps) {
    return (
        <div className="mt-8 animate-in fade-in duration-300">
            <div className="flex gap-4 h-[600px]">
                {/* Code Editor */}
                <div className="flex-1 bg-[#1e1e1e] border border-white/10 rounded-lg overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-white/10/5 border-b border-white/5 shrink-0">
                        <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
                        <div className="flex items-center gap-4">
                            {loadingRaw && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mr-2">Editable</span>
                                <Button
                                    size="sm"
                                    onClick={handleSaveCode}
                                    disabled={isSavingCode || loadingRaw}
                                    className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-widest gap-1.5 rounded-lg"
                                >
                                    {isSavingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                    Commit Code
                                </Button>
                            </div>
                        </div>
                    </div>
                    {loadingRaw ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-white/20" />
                        </div>
                    ) : (
                        <textarea
                            value={rawContent || ""}
                            onChange={(e) => setRawContent(e.target.value)}
                            className="w-full flex-1 p-4 bg-[#0A0A0B] text-blue-100 font-mono text-sm focus:outline-none resize-none leading-relaxed custom-scrollbar selection:bg-primary/30"
                            spellCheck={false}
                        />
                    )}
                </div>

                {/* AI Assistant Panel */}
                <div className="w-[350px] bg-[#1e1e1e] border border-white/10 rounded-lg flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 bg-white/5 border-white/10/5 flex items-center gap-2 shrink-0">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-white">AI Architect</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
                        {chatHistory.length === 0 && (
                            <div className="bg-white/5 border-white/10/5 p-3 rounded-lg border border-white/5">
                                <p className="text-xs text-white/70 leading-relaxed">
                                    I'm ready to help you refactor <strong>{fileName}</strong>.
                                    I can analyze the code structure, suggest security fixes, or implement new patterns.
                                </p>
                            </div>
                        )}

                        {chatHistory.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[90%] rounded-lg p-3 text-xs ${msg.role === 'user'
                                    ? 'bg-purple-500/20 text-purple-100 border border-purple-500/30'
                                    : 'bg-white/5 border-white/10/5 text-white/90 border border-white/10'
                                    }`}>
                                    {msg.role === 'assistant' ? (
                                        msg.content.split(/(<thinking>[\s\S]*?<\/thinking>)/g).map((part: string, j: number) => {
                                            if (part.startsWith('<thinking>')) {
                                                return (
                                                    <div key={j} className="mb-2 p-2 bg-yellow-500/5 border-l-2 border-yellow-500/30 text-yellow-500/70 text-[10px] italic font-mono">
                                                        {part.replace(/<\/?thinking>/g, '').trim()}
                                                    </div>
                                                );
                                            }
                                            if (!part.trim()) return null;
                                            return <div key={j} className="whitespace-pre-wrap">{part.trim()}</div>
                                        })
                                    ) : (
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {sendingChat && (
                            <div className="flex items-start">
                                <div className="bg-white/5 border-white/10/5 rounded-lg p-3 border border-white/10">
                                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 border-t border-white/5 bg-white/5 border-white/10/[0.02]">
                        <div className="relative">
                            <textarea
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendChat();
                                    }
                                }}
                                disabled={sendingChat}
                                placeholder="Ask to refactor or explain (e.g. 'Optimize this loop')..."
                                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-xs text-white focus:ring-1 focus:ring-purple-500 outline-none resize-none h-20 placeholder-white/20"
                            />
                            <button
                                onClick={handleSendChat}
                                disabled={!chatInput.trim() || sendingChat}
                                className="absolute bottom-2 right-2 p-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white transition-colors"
                            >
                                <Sparkles className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

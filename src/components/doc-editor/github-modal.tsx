import { Github, X, Loader2 } from "lucide-react";

interface GithubRepo {
    id: number;
    full_name: string;
    language: string;
    private: boolean;
    updated_at: string;
}

interface GithubModalProps {
    isOpen: boolean;
    onClose: () => void;
    repos: GithubRepo[];
    pushingToGithub: boolean;
    onPush: (repoFullName: string) => void;
}

export function GithubModal({ isOpen, onClose, repos, pushingToGithub, onPush }: GithubModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white/5 border-white/10 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-white/5 rounded-t-xl border-white/10">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                        <Github className="w-5 h-5" />
                        Select Repository
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-zinc-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <p className="text-sm text-gray-500 mb-4">
                        Select a repository to create a Pull Request with the generated documentation.
                    </p>
                    {pushingToGithub ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
                            <p className="text-zinc-400 font-medium">Creating Pull Request...</p>
                            <p className="text-sm text-gray-400">This might take a moment.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {repos.map(repo => (
                                <button
                                    key={repo.id}
                                    onClick={() => onPush(repo.full_name)}
                                    className="w-full text-left p-4 border border-white/10 rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-all group"
                                >
                                    <div className="font-semibold text-zinc-100 group-hover:text-blue-400">{repo.full_name}</div>
                                    <div className="text-xs text-gray-500 flex gap-4 mt-1">
                                        <span>{repo.language || "Unknown"}</span>
                                        <span>{repo.private ? "Private" : "Public"}</span>
                                        <span>{new Date(repo.updated_at).toLocaleDateString()}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

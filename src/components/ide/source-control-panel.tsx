'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Plus, GitCommitHorizontal, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { parseGitStatus } from './shared/ide-constants';
import type { ParsedGitStatus } from './shared/types';

export function SourceControlPanel() {
    const [status, setStatus] = useState<ParsedGitStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [commitMessage, setCommitMessage] = useState('');
    const [stagingPath, setStagingPath] = useState<string | null>(null);
    const [isCommitting, setIsCommitting] = useState(false);

    const fetchStatus = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/git/status');
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Failed to fetch git status');
            }
            const data = (await res.json()) as { status?: string };
            setStatus(parseGitStatus(data.status || ""));
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to fetch git status');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleStage = async (filePath: string) => {
        if (stagingPath || isCommitting) return;

        setStagingPath(filePath);
        setError(null);
        try {
            const res = await fetch('/api/git/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath }),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to stage file');
            }
            await fetchStatus(); // Refresh status
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to stage file');
        } finally {
            setStagingPath(null);
        }
    };

    const handleCommit = async () => {
        if (isCommitting || stagingPath) return;

        if (!commitMessage.trim()) {
            setError("Commit message cannot be empty.");
            return;
        }
        setIsCommitting(true);
        setError(null);
        try {
            const res = await fetch('/api/git/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: commitMessage }),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to commit changes');
            }
            setCommitMessage('');
            await fetchStatus(); // Refresh status
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to commit changes');
        } finally {
            setIsCommitting(false);
        }
    };
    
    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Source Control</h2>
                <Button variant="ghost" size="icon" onClick={fetchStatus} disabled={isLoading}>
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex-grow flex flex-col">
                <Textarea
                    placeholder="Commit message..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="mb-2"
                    rows={3}
                />
                <Button onClick={handleCommit} disabled={isLoading || isCommitting || Boolean(stagingPath) || !commitMessage.trim()} className="mb-4">
                    {isCommitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitCommitHorizontal className="mr-2 h-4 w-4" />} Commit
                </Button>
                
                <h3 className="font-semibold mb-2">Changes</h3>
                <div className="flex-1 overflow-auto border rounded-md">
                    {isLoading ? (
                        <div className="p-2 space-y-2">
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-2/3" />
                        </div>
                    ) : error ? (
                        <div className="p-2 text-red-500">{error}</div>
                    ) : status?.files.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">No changes detected.</div>
                    ) : (
                        <ul className="divide-y">
                            {status?.files.map(({ path, status: fileStatus }) => (
                                <li key={path} className="p-2 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <span className="flex items-center">
                                        <span className="font-mono text-sm mr-4">{path}</span>
                                        <span className="text-xs font-bold text-blue-500">{fileStatus}</span>
                                    </span>
                                    <Button variant="outline" size="sm" onClick={() => handleStage(path)} disabled={Boolean(stagingPath) || isCommitting}>
                                        {stagingPath === path ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

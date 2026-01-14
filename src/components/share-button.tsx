'use client';

import { useState } from 'react';
import { Share2, Copy, Check, Link, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface ShareButtonProps {
    docId: string;
    fileName: string;
    isPublic: boolean;
}

export function ShareButton({ docId, fileName, isPublic }: ShareButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [shareToken, setShareToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [daysToExpire, setDaysToExpire] = useState<number>(30);

    const generateShareLink = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/docs/${docId}/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    daysToExpire,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setShareToken(data.token);

                // Also set the documentation to public
                await fetch(`/api/docs/${docId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        isPublic: true,
                    }),
                });
            } else {
                toast.error('Failed to generate share link');
            }
        } catch (error) {
            console.error('Share generation error:', error);
            toast.error('Failed to generate share link');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async () => {
        if (!shareToken) return;

        const shareUrl = `${window.location.origin}/share/${shareToken}`;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success('Share link copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast.error('Failed to copy to clipboard');
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        setShareToken(null);
        setCopied(false);
        setDaysToExpire(30);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Share2 className="w-4 h-4" />
                    Share
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Share Documentation</DialogTitle>
                    <DialogDescription>
                        Generate a public link to share "{fileName}" with others.
                    </DialogDescription>
                </DialogHeader>

                {shareToken ? (
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="share-url">Share URL</Label>
                            <div className="flex gap-2 mt-1">
                                <Input
                                    id="share-url"
                                    value={`${window.location.origin}/share/${shareToken}`}
                                    readOnly
                                    className="font-mono text-sm"
                                />
                                <Button
                                    size="icon"
                                    onClick={copyToClipboard}
                                    variant={copied ? "primary" : "outline"}
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            <span>Expires in {daysToExpire} days</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Anyone with this link can view the documentation. The link will expire automatically.
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleClose} className="flex-1">
                                Close
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="days-to-expire">Link Expiration</Label>
                            <div className="flex items-center gap-2 mt-1">
                                <Input
                                    id="days-to-expire"
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={daysToExpire}
                                    onChange={(e) => setDaysToExpire(Number(e.target.value))}
                                    className="w-20"
                                />
                                <span className="text-sm text-muted-foreground">days</span>
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Link className="w-4 h-4" />
                            This will make the documentation publicly accessible
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleClose} className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                onClick={generateShareLink}
                                disabled={loading}
                                className="flex-1"
                            >
                                {loading ? 'Generating...' : 'Generate Link'}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

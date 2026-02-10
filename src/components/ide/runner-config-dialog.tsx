
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Server, ShieldCheck, Globe } from 'lucide-react';

interface RunnerConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (config: { name: string; endpoint: string; token: string }) => void;
}

export function RunnerConfigDialog({ open, onOpenChange, onSave }: RunnerConfigDialogProps) {
    const [name, setName] = useState('');
    const [endpoint, setEndpoint] = useState('https://runner.your-domain.com');
    const [token, setToken] = useState('');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#1e1e1e] border-white/10 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-indigo-400" />
                        Add Self-Hosted Runner
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Connect your own infrastructure to run heavy workloads securely within your VPC.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name" className="text-zinc-300">Runner Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. AWS-Production-Cluster"
                            className="bg-black/20 border-white/10 text-white focus:border-indigo-500"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="endpoint" className="text-zinc-300">Dispatcher Endpoint</Label>
                        <Input
                            id="endpoint"
                            value={endpoint}
                            onChange={(e) => setEndpoint(e.target.value)}
                            className="bg-black/20 border-white/10 text-white focus:border-indigo-500 font-mono text-xs"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="token" className="text-zinc-300">Auth Token</Label>
                        <Input
                            id="token"
                            type="password"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="sk_runner_..."
                            className="bg-black/20 border-white/10 text-white focus:border-indigo-500 font-mono text-xs"
                        />
                    </div>

                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3 text-xs text-emerald-400 flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                            <strong>Enterprise Grade Security:</strong> Code execution happens in your isolated environment with end-to-end encryption.
                        </span>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            if (name && endpoint && token) {
                                onSave({ name, endpoint, token });
                                onOpenChange(false);
                            }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        Connect Runner
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

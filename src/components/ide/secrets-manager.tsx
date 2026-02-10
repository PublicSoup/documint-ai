
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

interface Secret {
    key: string;
    value: string;
}

interface SecretsManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    secrets: Secret[];
    onSave: (secrets: Secret[]) => void;
}

export function SecretsManager({ open, onOpenChange, secrets: initialSecrets, onSave }: SecretsManagerProps) {
    const [secrets, setSecrets] = useState<Secret[]>(initialSecrets || []);
    const [showValues, setShowValues] = useState<Record<number, boolean>>({});

    const addSecret = () => {
        setSecrets([...secrets, { key: "", value: "" }]);
    };

    const removeSecret = (index: number) => {
        const newSecrets = [...secrets];
        newSecrets.splice(index, 1);
        setSecrets(newSecrets);
    };

    const updateSecret = (index: number, field: 'key' | 'value', value: string) => {
        const newSecrets = [...secrets];
        newSecrets[index][field] = value;
        setSecrets(newSecrets);
    };

    const toggleShow = (index: number) => {
        setShowValues(prev => ({ ...prev, [index]: !prev[index] }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#1e1e1e] border-white/10 text-white sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-amber-500" />
                        Environment Secrets
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Manage environment variables injected into the runtime. Values are encrypted at rest.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {secrets.length === 0 && (
                        <div className="text-center py-8 text-zinc-500 text-sm border border-dashed border-white/10 rounded-lg">
                            No secrets configured. Add one to get started.
                        </div>
                    )}

                    {secrets.map((secret, index) => (
                        <div key={index} className="flex gap-2 items-start group">
                            <div className="grid gap-1 flex-1">
                                <Label className="text-[10px] text-zinc-500 uppercase font-mono">Key</Label>
                                <Input
                                    value={secret.key}
                                    onChange={(e) => updateSecret(index, 'key', e.target.value.toUpperCase())}
                                    placeholder="API_KEY"
                                    className="bg-black/20 border-white/10 font-mono text-xs h-8"
                                />
                            </div>
                            <div className="grid gap-1 flex-[2] relative">
                                <Label className="text-[10px] text-zinc-500 uppercase font-mono">Value</Label>
                                <Input
                                    value={secret.value}
                                    onChange={(e) => updateSecret(index, 'value', e.target.value)}
                                    type={showValues[index] ? "text" : "password"}
                                    placeholder="sk_..."
                                    className="bg-black/20 border-white/10 font-mono text-xs h-8 pr-8"
                                />
                                <button
                                    onClick={() => toggleShow(index)}
                                    className="absolute right-2 top-[22px] text-zinc-500 hover:text-white"
                                >
                                    {showValues[index] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                </button>
                            </div>
                            <div className="grid gap-1 pt-5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => removeSecret(index)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-between items-center border-t border-white/10 pt-4">
                    <Button variant="outline" size="sm" onClick={addSecret} className="border-white/10 hover:bg-white/5 text-zinc-300">
                        <Plus className="w-3 h-3 mr-1" /> Add Secret
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-400 hover:text-white">
                            Cancel
                        </Button>
                        <Button onClick={() => { onSave(secrets); onOpenChange(false); }} className="bg-amber-600 hover:bg-amber-700 text-white">
                            Save Secrets
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

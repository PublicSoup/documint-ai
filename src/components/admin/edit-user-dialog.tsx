
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface User {
    id: string;
    name: string | null;
    email: string | null;
}

interface EditUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    onSave: (id: string, data: { name: string; email: string; password?: string }) => void;
}

export function EditUserDialog({ open, onOpenChange, user, onSave }: EditUserDialogProps) {
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [password, setPassword] = useState('');

    // Reset state when user changes
    React.useEffect(() => {
        if (user) {
            setName(user.name || '');
            setEmail(user.email || '');
            setPassword('');
        }
    }, [user]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#1e1e1e] border-white/10 text-white sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit User</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-black/20 border-white/10"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-black/20 border-white/10"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="password">New Password (Optional)</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-black/20 border-white/10"
                            placeholder="Leave blank to keep current"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10 hover:bg-white/5 text-zinc-300">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            if (user) {
                                onSave(user.id, { name, email, password: password || undefined });
                                onOpenChange(false);
                            }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Folder } from "lucide-react";

interface CreateFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "file" | "folder";
  parentId: string;
  onCreate: (name: string) => boolean | Promise<boolean>;
}

export function CreateFileDialog({ open, onOpenChange, type, parentId, onCreate }: CreateFileDialogProps) {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && !isCreating) {
      setIsCreating(true);
      try {
        const created = await onCreate(name.trim());
        if (created) {
          setName("");
          onOpenChange(false);
        }
      } finally {
        setIsCreating(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "file" ? <FileText className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
            Create a new {type}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isCreating} isLoading={isCreating}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Folder, Pencil } from "lucide-react";

export type CreateFileDialogType = "file" | "folder" | "rename";

interface CreateFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CreateFileDialogType;
  parentId: string;
  initialName?: string;
  onCreate: (name: string) => boolean | Promise<boolean>;
}

const DIALOG_COPY: Record<CreateFileDialogType, { title: string; submit: string; icon: ReactNode }> = {
  file: { title: "Create a new file", submit: "Create", icon: <FileText className="w-4 h-4" /> },
  folder: { title: "Create a new folder", submit: "Create", icon: <Folder className="w-4 h-4" /> },
  rename: { title: "Rename file", submit: "Rename", icon: <Pencil className="w-4 h-4" /> },
};

export function CreateFileDialog({ open, onOpenChange, type, parentId, initialName = "", onCreate }: CreateFileDialogProps) {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const copy = DIALOG_COPY[type];

  useEffect(() => {
    if (open) setName(initialName);
  }, [initialName, open]);

  const handleSubmit = async (e: FormEvent) => {
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
            {copy.icon}
            {copy.title}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <p className="text-xs text-muted-foreground">
              {type === "rename"
                ? "Enter the new full path for this file."
                : `Creating inside ${parentId === "Project" ? "Project" : parentId.replace("Project/", "")}`}
            </p>
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
            <Button type="submit" disabled={!name.trim() || isCreating} isLoading={isCreating}>{copy.submit}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import dynamic from "next/dynamic";
import type { IDEFile } from "@/components/ide/shared/types";

interface CodeClientProps {
  files: IDEFile[];
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  subscription: {
    plan?: string;
    status?: string;
    isActive?: boolean;
    isPro?: boolean;
    isTeam?: boolean;
    limits?: {
      totalFiles?: number;
      maxTokens?: number;
    };
    isDevMode?: boolean;
  };
}

const EnhancedIDELayout = dynamic(
  () => import("@/components/ide/enhanced-ide-layout"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#030014] text-white/50">
        Loading IDE...
      </div>
    ),
  },
);

export default function CodeClient({
  files,
  user,
  subscription,
}: CodeClientProps) {
  return (
    <EnhancedIDELayout files={files} user={user} subscription={subscription} />
  );
}

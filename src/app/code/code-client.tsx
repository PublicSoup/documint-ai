"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
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

// One-shot flag so a browser that genuinely can't isolate (e.g. Firefox/Safari
// with COEP: credentialless, or an extension stripping headers) doesn't reload
// forever.
const COI_RELOAD_KEY = "documint:coi-reload";

type IsolationStatus = "checking" | "ready" | "blocked";

/**
 * WebContainers require a cross-origin-isolated context (crossOriginIsolated).
 * That flag is decided when the top-level document is created and can NOT change
 * via client-side navigation. Because /code is often reached through a Next.js
 * <Link>/router.push from a page without COOP/COEP, the IDE can end up running
 * inside a non-isolated document even though /code's own response headers are
 * correct. A single hard reload re-fetches /code as a top-level navigation with
 * the isolation headers, which fixes it. If it's still not isolated after that,
 * the environment genuinely can't support it, so we show guidance instead of
 * letting the WebContainer boot fail with a cryptic error.
 */
function useCrossOriginIsolationGuard(): IsolationStatus {
  const [status, setStatus] = useState<IsolationStatus>("checking");

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.crossOriginIsolated) {
      // Clear the one-shot flag so a later session can self-heal again.
      try {
        window.sessionStorage.removeItem(COI_RELOAD_KEY);
      } catch {
        /* sessionStorage may be unavailable in some privacy modes. */
      }
      setStatus("ready");
      return;
    }

    let alreadyTried = false;
    try {
      alreadyTried = window.sessionStorage.getItem(COI_RELOAD_KEY) === "1";
    } catch {
      /* If sessionStorage is blocked we can't guard the loop; treat as tried. */
      alreadyTried = true;
    }

    if (!alreadyTried) {
      try {
        window.sessionStorage.setItem(COI_RELOAD_KEY, "1");
      } catch {
        /* ignore */
      }
      window.location.reload();
      return;
    }

    setStatus("blocked");
  }, []);

  return status;
}

function IsolationBlocked() {
  const retry = () => {
    try {
      window.sessionStorage.removeItem(COI_RELOAD_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <h2 className="mb-2 text-lg font-medium text-white">
          Browser can&apos;t run the in-browser IDE
        </h2>
        <p className="mb-4 text-sm text-white/60">
          The Cloud IDE needs a cross-origin-isolated context (for
          <code className="mx-1 rounded bg-black/40 px-1">SharedArrayBuffer</code>)
          and this tab isn&apos;t getting one. Try these, in order:
        </p>
        <ul className="mb-5 space-y-1.5 text-left text-sm text-white/60">
          <li>• Use the latest <strong>Chrome</strong> or <strong>Edge</strong> (Firefox/Safari have limited support).</li>
          <li>• Disable extensions that block <code className="rounded bg-black/40 px-1">stackblitz.com</code> (ad-blockers, Brave Shields, privacy blockers), or try a private window.</li>
          <li>• Hard-refresh the page.</li>
        </ul>
        <button
          onClick={retry}
          className="inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          <RefreshCcw className="h-4 w-4" />
          Reload and try again
        </button>
      </div>
    </div>
  );
}

export default function CodeClient({
  files,
  user,
  subscription,
}: CodeClientProps) {
  const isolation = useCrossOriginIsolationGuard();

  if (isolation === "checking") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#030014] text-white/50">
        Preparing secure runtime…
      </div>
    );
  }

  if (isolation === "blocked") {
    return <IsolationBlocked />;
  }

  return (
    <EnhancedIDELayout files={files} user={user} subscription={subscription} />
  );
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DEFAULT_SUBSCRIPTION, getUserSubscription } from "@/lib/subscription";
import type { File as PrismaFile } from "@prisma/client";
import { Metadata } from "next";
import { Suspense } from "react";
import CodeClient from "./code-client";
import type { IDEFile } from "@/components/ide/shared/types";

export const metadata: Metadata = {
  title: "Web IDE | DocuMint AI",
  description: "Cloud Development Environment",
};

function serializeIDEFile(file: PrismaFile): IDEFile {
  return {
    ...file,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

export default async function CodePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/auth/login");
  }

  const subscription = await getUserSubscription(userId).catch(
    () => DEFAULT_SUBSCRIPTION,
  );

  if (!subscription.isPro && !subscription.isTeam && !subscription.isDevMode) {
    redirect("/dashboard/billing");
  }

  const files = subscription.isDevMode
    ? []
    : await db.file
        .findMany({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
        .then((items: PrismaFile[]) => items.map(serializeIDEFile))
        .catch(() => []);

  const clientSubscription = {
    plan: subscription.plan,
    status: subscription.status,
    isActive: subscription.isActive,
    isPro: subscription.isPro,
    isTeam: subscription.isTeam,
    isDevMode: subscription.isDevMode,
    limits: {
      totalFiles: subscription.limits.totalFiles,
      maxTokens: subscription.limits.aiTokenAllowance,
    },
  };

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#1e1e1e] overscroll-none z-9999">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-white/50">
            Loading IDE...
          </div>
        }
      >
        <CodeClient
          files={files}
          user={session.user}
          subscription={clientSubscription}
        />
      </Suspense>
    </div>
  );
}

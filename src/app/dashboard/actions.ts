"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { unstable_cache as cache } from "next/cache";
import { computeFileMetrics } from '@/lib/file-insights';
import { File, Prisma } from "@prisma/client";

export type PriorityAction = {
  id: string;
  fileId: string;
  label: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
};

export type Hotspot = File & {
  riskScore: number;
  isDocumented: boolean;
};

type PriorityActionsResult = {
  actions: PriorityAction[];
  hotspots: Hotspot[];
};

export const getPriorityActions = cache(
  async (userId: string, teamId?: string): Promise<PriorityActionsResult> => {
    const whereClause = teamId ? { teamId } : { userId, teamId: null };

    // Fetch files WITH content for real metrics computation
    const files = await db.file.findMany({
      where: whereClause,
      include: {
        documentation: {
          select: { status: true, verifiedAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const actions: PriorityAction[] = [];
    const hotspots: Hotspot[] = [];

    for (const file of files) {
      const content = file.content || "";
      const metrics = computeFileMetrics(content, file.language || "plaintext");
      const hasDoc =
        !!file.documentation &&
        (file.documentation.status === "APPROVED" ||
          file.documentation.status === "REVIEW");
      const isStale =
        !!file.documentation?.verifiedAt &&
        Date.now() - file.documentation.verifiedAt.getTime() > 30 * 24 * 60 * 60 * 1000;

      // Priority actions: undocumented files (the core remediation queue for a
      // documentation product), or stale docs. Gate on the same risk bar as
      // hotspots (>30) so the queue actually populates instead of only firing
      // for very large/complex files; rank by risk so the riskiest surface
      // first, and the list is capped at 10 below.
      if (!hasDoc && metrics.riskScore > 30) {
        actions.push({
          id: `action-${file.id}-missing-doc`,
          fileId: file.id,
          label: `Generate documentation for ${file.name} (risk: ${metrics.riskScore})`,
          priority:
            metrics.riskScore > 80
              ? "CRITICAL"
              : metrics.riskScore > 50
                ? "HIGH"
                : "MEDIUM",
        });
      } else if (isStale) {
        actions.push({
          id: `action-${file.id}-stale-doc`,
          fileId: file.id,
          label: `Documentation is stale for ${file.name} (30+ days)`,
          priority: "MEDIUM",
        });
      }

      if (metrics.todoCount >= 3) {
        actions.push({
          id: `action-${file.id}-todos`,
          fileId: file.id,
          label: `${metrics.todoCount} TODO/FIXME items in ${file.name}`,
          priority: metrics.todoCount >= 5 ? "HIGH" : "MEDIUM",
        });
      }

      // Hotspots: all files with risk > 30
      if (metrics.riskScore > 30 || !hasDoc) {
        hotspots.push({
          ...file,
          riskScore: metrics.riskScore,
          isDocumented: hasDoc,
        } as Hotspot);
      }
    }

    // Sort actions by priority
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    actions.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    // Sort hotspots by risk descending, take top 8
    hotspots.sort((a, b) => b.riskScore - a.riskScore);

    return {
      actions: actions.slice(0, 10),
      hotspots: hotspots.slice(0, 8),
    };
  },
  ["priority-actions"],
  { revalidate: 60 }
);

// --- NEW 'createTeam' ACTION ---

const createTeamSchema = z.object({
  name: z.string().min(2, "Team name must be at least 2 characters.").max(100, "Team name must be 100 characters or fewer."),
});

export type FormState = {
  message: string;
  success: boolean;
};

export async function createTeam(
  prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      message: "Authentication error: You must be logged in to create a team.",
      success: false,
    };
  }

  const validatedFields = createTeamSchema.safeParse({
    name: formData.get("name"),
  });

  if (!validatedFields.success) {
    return {
      message: validatedFields.error.flatten().fieldErrors.name?.[0] || "Invalid input.",
      success: false,
    };
  }

  const { name } = validatedFields.data;
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  try {
    await db.$transaction(async (prisma: Prisma.TransactionClient) => {
      const newTeam = await prisma.team.create({
        data: {
          name,
          slug: `${slug}-${Date.now()}`, // Append timestamp for uniqueness
          plan: "STARTER", // Default plan
        },
      });

      await prisma.teamMember.create({
        data: {
          teamId: newTeam.id,
          userId: session.user.id,
          role: "OWNER",
        },
      });
    });
  } catch (e) {
    console.error("Team creation failed:", e);
    return {
      message: "Database error: Failed to create the team.",
      success: false,
    };
  }

  revalidatePath("/dashboard");

  return {
    message: "Team created successfully.",
    success: true,
  };
}

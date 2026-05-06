"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { unstable_cache as cache } from 'next/cache';
import { File, Prisma } from "@prisma/client";

// Reconstructed based on usage in src/app/dashboard/page.tsx
export const getPriorityActions = cache(
  async (userId: string, teamId?: string) => {
    console.log(`[Cache] Fetching priority actions for teamId: ${teamId || 'personal'}`);
    // This is a placeholder implementation. The actual logic would involve complex analysis.
    const whereClause = teamId ? { teamId } : { userId, teamId: null };

    // Placeholder data - in a real scenario, this would query for code quality issues, etc.
    const hotspots = await db.file.findMany({
        where: {
            ...whereClause,
            // Some logic to find "hotspots", e.g. low documentation score
        },
        take: 5,
        orderBy: {
            // Some logic for ordering
            updatedAt: 'asc'
        }
    });

    return {
      actions: [
        { id: "1", fileId: "placeholder-file-1", label: "Review outdated documentation in api/route.ts", priority: "CRITICAL" },
        { id: "2", fileId: "placeholder-file-2", label: "Refactor complex component: <PaymentForm>", priority: "HIGH" },
      ],
      hotspots: hotspots.map((f: File) => ({ ...f, riskScore: Math.floor(Math.random() * 50) + 50, isDocumented: Math.random() > 0.5 }))
    };
  },
  ['priority-actions'], // Cache key prefix
  { revalidate: 60 } // Revalidate every 60 seconds
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

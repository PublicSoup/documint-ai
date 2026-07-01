
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty.").max(255, "Name is too long."),
  type: z.enum(["file", "folder"]),
  parentId: z.string().optional(), // ID of the parent folder in the tree, e.g., "Project/src"
  teamId: z.string().optional(),
  content: z.string().max(1024 * 1024 * 5).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw ApiErrors.unauthorized();
    }

    await enforceRateLimit(session.user.id, "file_create");

    const { name, type, parentId, teamId, content } = await validateBody(request, createSchema);

    let finalName = name;
    if (parentId && parentId !== "Project") {
        finalName = `${parentId.replace('Project/', '')}/${name}`;
    }

    const normalizedContent = type === "folder" ? "" : (content ?? "");
    const normalizedLanguage = type === "folder"
      ? "folder"
      : (name.split('.').pop()?.toLowerCase() || 'plaintext');

    // Authorization Check
    if (teamId) {
      const hasPermission = await checkTeamPermission(session.user.id, teamId, "edit");
      if (!hasPermission) {
        throw ApiErrors.forbidden("You don't have permission to create files in this team.");
      }
    }

    // Upsert by (owner, name): if a file with this path already exists, update it
    // in place instead of creating a duplicate. This keeps the file tree clean and
    // lets the in-IDE agent (which persists edits to the DB directly) and this
    // endpoint converge on a single record. For folders we keep the placeholder.
    const storedName = type === "folder" ? `${finalName}/` : finalName;
    const ownerWhere = teamId
      ? { teamId, name: storedName }
      : { userId: session.user.id, teamId: null, name: storedName };

    const existing = await db.file.findFirst({ where: ownerWhere, select: { id: true } });

    const newFile = existing
      ? await db.file.update({
          where: { id: existing.id },
          data: {
            content: normalizedContent,
            language: normalizedLanguage,
            size: normalizedContent.length,
          },
        })
      : await db.file.create({
          data: {
            name: storedName,
            userId: teamId ? null : session.user.id,
            teamId: teamId,
            content: normalizedContent,
            language: normalizedLanguage,
            size: normalizedContent.length,
          },
        });

    await logAudit({
      userId: session.user.id,
      action: "CREATE_FILE_OR_FOLDER",
      entity: "File",
      entityId: newFile.id,
        details: { name, type, parentId, teamId, finalName },
    });

    return NextResponse.json(newFile, { status: 201 });

  } catch (error) {
    return errorResponse(error);
  }
}

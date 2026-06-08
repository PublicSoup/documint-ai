import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiErrors, errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkTeamPermission } from "@/lib/permissions";
import { deleteLocalFile, listLocalFiles } from "@/lib/local-dev-storage";
import { isSafeWorkspacePath, normalizeWorkspaceName } from "@/components/ide/shared/ide-constants";

const paramsSchema = z.object({
    workspace: z.string().trim().min(1).max(80),
}).strict();

const querySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

interface DeleteProjectResponse {
    success: true;
    workspace: string;
    deletedCount: number;
    deletedFileIds: string[];
}

type ProjectFileDeleteTarget = {
    id: string;
    name: string;
};

function parseWorkspace(rawWorkspace: string): string {
    const workspace = normalizeWorkspaceName(decodeURIComponent(rawWorkspace));
    if (!workspace || workspace === "Project") {
        throw ApiErrors.badRequest("Choose a concrete project workspace to delete.");
    }

    if (workspace.includes("/") || !isSafeWorkspacePath(workspace)) {
        throw ApiErrors.badRequest("Invalid project workspace name.");
    }

    return workspace;
}

function buildProjectWhere(userId: string, workspace: string, teamId?: string): Prisma.FileWhereInput {
    const prefix = `${workspace}/`;

    return {
        name: { startsWith: prefix },
        ...(teamId ? { teamId } : { userId, teamId: null }),
    };
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ workspace: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        await enforceRateLimit(session.user.id, "project_delete");

        const resolvedParams = paramsSchema.parse(await params);
        const { teamId } = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
        const workspace = parseWorkspace(resolvedParams.workspace);

        if (session.user.id.startsWith("dev-")) {
            const localFiles = await listLocalFiles();
            const filesToDelete = localFiles.filter((file) => normalizeWorkspaceName(file.name).startsWith(`${workspace}/`));

            await Promise.all(filesToDelete.map((file) => deleteLocalFile(file.id)));

            return NextResponse.json({
                success: true,
                workspace,
                deletedCount: filesToDelete.length,
                deletedFileIds: filesToDelete.map((file) => file.id),
            } satisfies DeleteProjectResponse);
        }

        if (teamId) {
            const hasDeletePermission = await checkTeamPermission(session.user.id, teamId, "delete");
            if (!hasDeletePermission) {
                return errorResponse(ApiErrors.forbidden("You do not have permission to delete this team project."));
            }
        }

        const where = buildProjectWhere(session.user.id, workspace, teamId);
        const result: ProjectFileDeleteTarget[] = await db.$transaction(async (tx: Prisma.TransactionClient): Promise<ProjectFileDeleteTarget[]> => {
            const projectFiles = await tx.file.findMany({
                where,
                select: { id: true, name: true },
            });

            if (projectFiles.length === 0) {
                throw ApiErrors.notFound("Project");
            }

            await tx.file.deleteMany({
                where: { id: { in: projectFiles.map((file) => file.id) } },
            });

            return projectFiles;
        });

        await logAudit({
            userId: session.user.id,
            action: "DELETE_PROJECT",
            entity: "Project",
            entityId: workspace,
            details: {
                workspace,
                teamId: teamId || null,
                deletedCount: result.length,
                fileNames: result.map((file: ProjectFileDeleteTarget) => file.name).slice(0, 100),
            },
        });

        return NextResponse.json({
            success: true,
            workspace,
            deletedCount: result.length,
            deletedFileIds: result.map((file: ProjectFileDeleteTarget) => file.id),
        } satisfies DeleteProjectResponse);
    } catch (error) {
        return errorResponse(error);
    }
}
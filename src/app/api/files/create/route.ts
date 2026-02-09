
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { createLocalFile } from "@/lib/local-dev-storage";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const { name, path, language, content } = await req.json();

        if (!name) {
            return new NextResponse("Name is required", { status: 400 });
        }

        // DEV MODE BYPASS: Use local storage when user is dev admin
        if (session.user.id.startsWith("dev-")) {
            console.log("📁 [Dev Mode] Creating local file:", name);
            const file = await createLocalFile(name, content || "");
            return NextResponse.json(file);
        }

        // Check if file already exists for this user
        // Note: Real apps would check path + name uniqueness
        const existing = await db.file.findFirst({
            where: {
                userId: session.user.id,
                name: name
            }
        });

        if (existing) {
            return new NextResponse("File already exists", { status: 409 });
        }

        const file = await db.file.create({
            data: {
                userId: session.user.id,
                name: name,
                language: language || "typescript", // Default to TS
                content: content || "",
                size: content ? content.length : 0,
                storagePath: path || `/${name}` // Simple flat structure for now
            }
        });

        return NextResponse.json(file);
    } catch (error) {
        console.error("[FILE_CREATE]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

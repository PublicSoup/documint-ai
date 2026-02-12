
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { createLocalFile } from "@/lib/local-dev-storage";

// Auto-detect language from file extension for Monaco editor
function detectLanguage(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
        css: 'css', scss: 'scss', less: 'less',
        html: 'html', htm: 'html',
        json: 'json', jsonc: 'json',
        md: 'markdown', mdx: 'markdown',
        py: 'python',
        rb: 'ruby',
        rs: 'rust',
        go: 'go',
        java: 'java',
        c: 'c', h: 'c',
        cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
        cs: 'csharp',
        php: 'php',
        sql: 'sql',
        sh: 'shell', bash: 'shell', zsh: 'shell',
        yaml: 'yaml', yml: 'yaml',
        xml: 'xml', svg: 'xml',
        graphql: 'graphql', gql: 'graphql',
        dockerfile: 'dockerfile',
        toml: 'ini',
        ini: 'ini',
        env: 'plaintext',
        txt: 'plaintext',
        log: 'plaintext',
    };
    return languageMap[ext || ''] || 'plaintext';
}

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

        // Auto-detect language from file extension if not explicitly provided
        const resolvedLanguage = language || detectLanguage(name);

        // DEV MODE BYPASS: Use local storage when user is dev admin
        if (session.user.id.startsWith("dev-")) {
            console.log("📁 [Dev Mode] Creating local file:", name);
            const file = await createLocalFile(name, content || "");
            return NextResponse.json(file);
        }

        // Check if file already exists for this user
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
                language: resolvedLanguage,
                content: content || "",
                size: content ? content.length : 0,
                storagePath: path || `/${name}`
            }
        });

        return NextResponse.json(file);
    } catch (error) {
        console.error("[FILE_CREATE]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

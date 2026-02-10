
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hash } from "bcryptjs";

// UPDATE USER
export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> } // Fix for Next.js 15+ param handling
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.email !== "admin@documintai.dev") {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { name, email, password } = body;

        const dataToUpdate: any = { name, email };
        if (password) {
            dataToUpdate.password = await hash(password, 12);
        }

        const updatedUser = await db.user.update({
            where: { id },
            data: dataToUpdate
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Admin User UPDATE Error:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

// DELETE USER
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> } // Fix for Next.js 15+ param handling
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.email !== "admin@documintai.dev") {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await params;

        // Prevent deleting self
        if (session.user.id === id) {
            return new NextResponse("Cannot delete yourself", { status: 400 });
        }

        await db.user.delete({
            where: { id }
        });

        return new NextResponse("User Deleted", { status: 200 });
    } catch (error) {
        console.error("Admin User DELETE Error:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

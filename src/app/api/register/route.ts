import { db } from "../../../lib/db";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

const userSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().min(1, "Email is required").email("Invalid email"),
    password: z.string().min(1, "Password is required").min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, name, password } = userSchema.parse(body);

        const existingUser = await db.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return NextResponse.json({ user: null, message: "User with this email already exists" }, { status: 409 });
        }

        const hashedPassword = await hash(password, 10);

        const newUser = await db.user.create({
            data: {
                name,
                email,
                password: hashedPassword
            }
        });

        const { password: _password, ...rest } = newUser;

        return NextResponse.json({ user: rest, message: "User created successfully" }, { status: 201 });
    } catch (error) {
        console.error("Registration error:", error);

        // Return more specific error messages
        if (error instanceof z.ZodError) {
            return NextResponse.json({ message: error.issues[0]?.message || "Validation failed" }, { status: 400 });
        }

        // Prisma errors
        if ((error as { code?: string })?.code === 'P2002') {
            return NextResponse.json({ message: "Email already registered" }, { status: 409 });
        }

        return NextResponse.json({ message: "Registration failed. Please try again." }, { status: 500 });
    }
}

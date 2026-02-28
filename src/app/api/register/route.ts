import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { z } from "zod";
import { sendEmail, emailTemplates } from "@/lib/email";
import { env } from "@/lib/env";
import { validateBody, errorResponse, successResponse, ApiErrors } from "@/lib/api-utils";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

const registerSchema = z
    .object({
        name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
        email: z.string().trim().toLowerCase().min(1, "Email is required").email("Invalid email address"),
        password: z.string()
            .min(8, "Password must be at least 8 characters")
            .max(100, "Password too long")
            .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
            .regex(/[a-z]/, "Password must contain at least one lowercase letter")
            .regex(/[0-9]/, "Password must contain at least one number"),
    })
    .strict();

export async function POST(req: Request) {
    try {
        // Rate limit: registration attempts per IP
        const clientIp = await getClientIP(req);
        await enforceRateLimit(clientIp, "auth");

        // Validate request body
        const { email, name, password } = await validateBody(req, registerSchema);

        // Additional Security: rate limit per normalized email
        await enforceRateLimit(email, "security");

        // Check if user exists
        const existingUser = await db.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw ApiErrors.conflict("User with this email already exists");
        }

        // Hash password
        const hashedPassword = await hash(password, 10);

        // Create user
        const newUser = await db.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
            },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                createdAt: true,
                updatedAt: true,
                role: true,
                emailVerified: true,
            },
        });

        // Audit logging (non-blocking)
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: newUser.id,
                action: "SIGN_UP",
                entity: "User",
                entityId: newUser.id,
                details: { method: "credentials", email: newUser.email },
            });
        } catch {
            // Non-blocking
        }

        // Send welcome email (non-blocking)
        sendEmail({
            to: email,
            subject: "Welcome to DocuMint AI! 🎉",
            html: emailTemplates.welcome(name, `${env.NEXT_PUBLIC_APP_URL}/dashboard`),
        }).catch(() => {
            // Non-blocking email delivery failure
        });

        return successResponse(
            {
                user: newUser,
                message: "User created successfully",
            },
            201,
        );
    } catch (error) {
        return errorResponse(error);
    }
}

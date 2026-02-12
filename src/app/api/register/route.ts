import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { z } from "zod";
import { sendEmail, emailTemplates } from "@/lib/email";
import { env } from "@/lib/env";
import { validateBody, errorResponse, successResponse, ApiErrors } from "@/lib/api-utils";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

const registerSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    email: z.string().min(1, "Email is required").email("Invalid email address"),
    password: z.string()
        .min(8, "Password must be at least 8 characters")
        .max(100, "Password too long")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
});

export async function POST(req: Request) {
    try {
        // Rate limit: 5 registration attempts per 15 minutes per IP
        const clientIp = getClientIP(req);
        await enforceRateLimit(clientIp, "auth");

        // Validate request body
        const { email, name, password } = await validateBody(req, registerSchema);

        // Check if user exists
        const existingUser = await db.user.findUnique({
            where: { email }
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
                password: hashedPassword
            }
        });

        // Send welcome email (non-blocking)
        sendEmail({
            to: email,
            subject: "Welcome to DocuMint AI! 🎉",
            html: emailTemplates.welcome(name, `${env.NEXT_PUBLIC_APP_URL}/dashboard`),
        }).catch(emailError => {
            console.error("Failed to send welcome email:", emailError);
        });

        // Return success (exclude password)
        const { password: _password, ...userWithoutPassword } = newUser;

        return successResponse({
            user: userWithoutPassword,
            message: "User created successfully"
        }, 201);

    } catch (error) {
        console.error("[Register] Error:", error instanceof Error ? error.message : error);
        if (error instanceof Error && error.stack) {
            console.error("[Register] Stack:", error.stack);
        }
        return errorResponse(error);
    }
}

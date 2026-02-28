import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { sendEmail, emailTemplates } from "@/lib/email";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

const resetRequestSchema = z.object({
    email: z.string().trim().email().max(100),
}).strict();

const resetConfirmSchema = z.object({
    token: z.string().min(1).max(255),
    password: z.string().min(8).max(100),
}).strict();

/**
 * POST /api/auth/reset-password
 * Initiates a password reset flow by sending a tokenized link to the user's email.
 */
export async function POST(req: NextRequest) {
    try {
        const clientIp = await getClientIP(req);
        // Initial generic rate limit by IP to prevent flooding
        await enforceRateLimit(clientIp, "auth");

        const { email } = await validateBody(req, resetRequestSchema);

        // Security: Higher-tier rate limit reset attempts per email
        await enforceRateLimit(email.toLowerCase(), "security");

        // Find user by email
        const user = await db.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true }
        });

        const successMessage = "If an account with that email exists, a password reset link has been sent.";

        // Ensure user has an email and didn't sign up via provider without one
        if (!user || !user.email) {
            // Don't reveal if email exists or not for security
            return NextResponse.json({ message: successMessage });
        }

        // Generate reset token
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

        // Store reset token in database
        await db.passwordResetToken.create({
            data: {
                userId: user.id,
                token,
                expiresAt,
            },
        });

        // Send reset email
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const resetUrl = `${appUrl}/auth/reset-password?token=${token}`;

        try {
            await sendEmail({
                to: email,
                subject: "Reset Your DocuMint AI Password",
                html: emailTemplates.passwordReset(user.name || "User", resetUrl),
            });
        } catch (emailError) {
            console.error("Failed to send password reset email:", emailError);
            // We still return success-like message to avoid enumeration, 
            // but log the error for ops.
        }

        return NextResponse.json({ message: successMessage });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * PUT /api/auth/reset-password
 * Verifies a reset token and updates the user's password.
 */
export async function PUT(req: NextRequest) {
    try {
        const clientIp = await getClientIP(req);
        await enforceRateLimit(clientIp, "auth");

        const { token, password } = await validateBody(req, resetConfirmSchema);

        // Find valid reset token
        const resetToken = await db.passwordResetToken.findFirst({
            where: {
                token,
                expiresAt: {
                    gt: new Date(),
                },
            },
            include: {
                user: {
                    select: { id: true, email: true, name: true }
                },
            },
        });

        if (!resetToken) {
            return errorResponse(ApiErrors.badRequest("Invalid or expired reset token"));
        }

        // Hash new password
        const hashedPassword = await hash(password, 12);

        // Update user password and delete used token in a transaction
        await db.$transaction([
            db.user.update({
                where: { id: resetToken.userId },
                data: { password: hashedPassword },
            }),
            db.passwordResetToken.delete({
                where: { id: resetToken.id },
            })
        ]);

        // Log audit event
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: resetToken.userId,
                action: "RESET_PASSWORD",
                entity: "User",
                entityId: resetToken.userId,
                details: { method: "forgot-password-flow" }
            });
        } catch {
            // Non-blocking
        }

        // Send confirmation email (async)
        if (resetToken.user.email) {
            sendEmail({
                to: resetToken.user.email,
                subject: "Your Password Has Been Reset",
                html: `
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <style>
                                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                                .header { background: linear-gradient(135deg, #10b981, #34d399); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                                .content { padding: 30px; background: #f9fafb; }
                                .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="header">
                                    <h1>Password Reset Successful 🔒</h1>
                                </div>
                                <div class="content">
                                    <h2>Hi ${resetToken.user.name || "User"},</h2>
                                    <p>Your DocuMint AI password has been successfully reset.</p>
                                    <p>If you did not initiate this change, please contact our support team immediately.</p>
                                    <p><strong>Best regards,<br>The DocuMint AI Security Team</strong></p>
                                </div>
                                <div class="footer">
                                    <p>&copy; ${new Date().getFullYear()} DocuMint AI. All rights reserved.</p>
                                </div>
                            </div>
                        </body>
                    </html>
                `,
            }).catch(() => {
                // Non-blocking email delivery failure.
            });
        }

        return NextResponse.json({ 
            success: true,
            message: "Password reset successfully. You can now log in with your new password." 
        });
    } catch (error) {
        return errorResponse(error);
    }
}

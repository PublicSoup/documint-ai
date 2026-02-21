import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { z } from "zod";
import { randomBytes } from "crypto";
import { sendEmail, emailTemplates } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";

const resetRequestSchema = z.object({
    email: z.string().email(),
});

const resetConfirmSchema = z.object({
    token: z.string(),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

// Generate a password reset token
export async function POST(req: Request) {
    try {
        const body = await req.clone().json();
        const { email } = resetRequestSchema.parse(body);

        // Security: Rate limit reset attempts per email
        await enforceRateLimit(email.trim().toLowerCase(), "security");

        // Find user by email
        const user = await db.user.findUnique({
            where: { email },
        });

        // Ensure user has an email and didn't sign up via provider without one (unlikely but safe)
        if (!user || !user.email) {
            // Don't reveal if email exists or not for security
            return NextResponse.json({
                message: "If an account with that email exists, a password reset link has been sent."
            });
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
        const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/reset-password?token=${token}`;

        try {
            await sendEmail({
                to: email,
                subject: "Reset Your DocuMint AI Password",
                html: emailTemplates.passwordReset(user.name || "User", resetUrl),
            });
        } catch (emailError) {
            console.error("Failed to send password reset email:", emailError);
            return NextResponse.json({
                error: "Failed to send email. Please try again."
            }, { status: 500 });
        }

        return NextResponse.json({
            message: "If an account with that email exists, a password reset link has been sent."
        });
    } catch (error) {
        console.error("Password reset request error:", error);

        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
        }

        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// Handle token verification and password reset
export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { token, password } = resetConfirmSchema.parse(body);

        // Find valid reset token
        const resetToken = await db.passwordResetToken.findFirst({
            where: {
                token,
                expiresAt: {
                    gt: new Date(),
                },
            },
            include: {
                user: true,
            },
        });

        if (!resetToken) {
            return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
        }

        // Hash new password
        const hashedPassword = await hash(password, 10);

        // Update user password
        await db.user.update({
            where: { id: resetToken.userId },
            data: { password: hashedPassword },
        });

        // Log audit event for password reset
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: resetToken.userId,
                action: "RESET_PASSWORD",
                entity: "User",
                entityId: resetToken.userId,
                details: { method: "forgot-password-flow" }
            });
        } catch (e) {}

        // Delete reset token
        await db.passwordResetToken.delete({
            where: { id: resetToken.id },
        });

        // Send confirmation email
        try {
            if (resetToken.user.email) {
                await sendEmail({
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
                                        <p>&copy; 2025 DocuMint AI. All rights reserved.</p>
                                    </div>
                                </div>
                            </body>
                        </html>
                    `,
                });
            }
        } catch (emailError) {
            console.error("Failed to send password reset confirmation email:", emailError);
            // Continue anyway
        }

        return NextResponse.json({ message: "Password reset successfully" });
    } catch (error) {
        console.error("Password reset confirmation error:", error);

        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
        }

        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

import { NextRequest } from "next/server";
import { ImageResponse } from "@vercel/og";
import { z } from "zod";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

const ogImageSchema = z.object({
    title: z.string().max(100).default("DocuMint AI"),
    desc: z
        .string()
        .max(200)
        .default("Intelligent Documentation for Modern Developers"),
});

export async function GET(req: NextRequest) {
    try {
        const ip = await getClientIP(req);
        // Apply rate limiting based on the client's IP address.
        await enforceRateLimit(ip, "api");

        const { searchParams } = new URL(req.url);

        const params = ogImageSchema.safeParse({
            title: searchParams.get("title") || undefined,
            desc: searchParams.get("desc") || undefined,
        });

        if (!params.success) {
            throw ApiErrors.badRequest(params.error.toString());
        }

        const { title, desc } = params.data;

        return new ImageResponse(
            (
                <div
                    style={{
                        height: "100%",
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#000000",
                        backgroundImage:
                            "linear-gradient(to bottom right, #000000, #111111)",
                    }}
                >
                    {/* Background Gradient Orbs */}
                    <div
                        style={{
                            position: "absolute",
                            top: "-10%",
                            left: "-10%",
                            width: "40%",
                            height: "40%",
                            background:
                                "linear-gradient(135deg, #7c3aed, #4f46e5)",
                            filter: "blur(100px)",
                            opacity: 0.2,
                            borderRadius: "50%",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            bottom: "-10%",
                            right: "-10%",
                            width: "40%",
                            height: "40%",
                            background:
                                "linear-gradient(135deg, #2563eb, #06b6d4)",
                            filter: "blur(100px)",
                            opacity: 0.2,
                            borderRadius: "50%",
                        }}
                    />

                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                            padding: "40px 80px",
                        }}
                    >
                        {/* Logo/Icon */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "80px",
                                height: "80px",
                                borderRadius: "20px",
                                background:
                                    "linear-gradient(135deg, #7c3aed, #2563eb)",
                                marginBottom: "40px",
                                boxShadow:
                                    "0 0 40px -10px rgba(124, 58, 237, 0.5)",
                            }}
                        >
                            <svg
                                width="48"
                                height="48"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                <polyline points="14 2 14 8 20 8" />
                                <path d="M16 13H8" />
                                <path d="M16 17H8" />
                                <path d="M10 9H8" />
                            </svg>
                        </div>

                        {/* Title */}
                        <div
                            style={{
                                fontSize: 60,
                                fontWeight: 900,
                                color: "white",
                                lineHeight: 1.1,
                                marginBottom: 20,
                                letterSpacing: "-2px",
                                textShadow: "0 0 40px rgba(0,0,0,0.5)",
                            }}
                        >
                            {title}
                        </div>

                        {/* Description */}
                        <div
                            style={{
                                fontSize: 30,
                                color: "#94a3b8",
                                lineHeight: 1.4,
                                marginBottom: 40,
                                maxWidth: 900,
                            }}
                        >
                            {desc}
                        </div>

                        {/* Brand Footer */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                marginTop: 20,
                            }}
                        >
                            <div
                                style={{
                                    height: "2px",
                                    width: "40px",
                                    background: "#334155",
                                    marginRight: "20px",
                                }}
                            />
                            <div
                                style={{
                                    fontSize: 24,
                                    color: "#475569",
                                    fontWeight: 600,
                                    letterSpacing: "2px",
                                    textTransform: "uppercase",
                                }}
                            >
                                DocuMint AI
                            </div>
                            <div
                                style={{
                                    height: "2px",
                                    width: "40px",
                                    background: "#334155",
                                    marginLeft: "20px",
                                }}
                            />
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            },
        );
    } catch (error) {
        // Use a consistent error response format.
        return errorResponse(error);
    }
}

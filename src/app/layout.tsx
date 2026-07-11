import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { env } from "@/lib/env";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Branded social-share card, generated on the fly by the /api/og route
// (@vercel/og). Relative URL resolves against `metadataBase` to an absolute URL
// for crawlers. Replaces the never-created static /og-image.png.
const OG_IMAGE = "/api/og?title=DocuMint+AI&desc=AI+documentation%2C+code+review+%26+architecture+diagrams+for+your+codebase";

export const metadata: Metadata = {
  title: {
    default: "DocuMint AI — AI Documentation, Code Review & Diagrams",
    template: "%s | DocuMint AI"
  },
  description: "The AI-powered engine that understands your codebase. Generate documentation, automated code reviews, and architecture diagrams in seconds — from your repos or files.",
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL || "https://documintai.dev"),
  applicationName: "DocuMint AI",
  authors: [{ name: "DocuMint AI" }],
  creator: "DocuMint AI",
  publisher: "DocuMint AI",
  category: "technology",
  keywords: [
    "AI documentation",
    "code documentation generator",
    "automated code review",
    "AI code review",
    "architecture diagrams",
    "codebase visualization",
    "developer tools",
    "documentation as code",
    "GitHub documentation",
    "Mermaid diagrams",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "DocuMint AI — AI Documentation, Code Review & Diagrams",
    description: "Generate documentation, automated code reviews, and architecture diagrams in seconds. The AI engine that actually understands your codebase.",
    siteName: "DocuMint AI",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "DocuMint AI — AI documentation, code review & architecture diagrams",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DocuMint AI — AI Documentation, Code Review & Diagrams",
    description: "Generate documentation, automated code reviews, and architecture diagrams in seconds.",
    images: [OG_IMAGE],
    creator: "@documint_ai",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

import ErrorBoundary from "@/components/error-boundary";
import { PageTransition } from "@/components/page-transition";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Conditionally load Vercel Analytics — noop on Cloudflare
const Analytics = process.env.VERCEL
  ? (await import("@vercel/analytics/next")).Analytics
  : () => null;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <ErrorBoundary>
            <PageTransition>
              {children}
            </PageTransition>
          </ErrorBoundary>
          {Analytics && <Analytics />}
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}

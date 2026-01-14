import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DocuMint AI - Intelligent Documentation",
    template: "%s | DocuMint AI"
  },
  description: "The AI-powered documentation engine that understands your codebase. Generate docs, audits, and diagrams in seconds.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://documint.ai"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://documint.ai",
    title: "DocuMint AI - Intelligent Documentation",
    description: "The AI-powered documentation engine that understands your codebase.",
    siteName: "DocuMint AI",
    images: [
      {
        url: "/og-image.png", // Ensure this exists in public/
        width: 1200,
        height: 630,
        alt: "DocuMint AI Preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DocuMint AI",
    description: "The AI-powered documentation engine that understands your codebase.",
    images: ["/og-image.png"],
    creator: "@documint_ai",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

import { ErrorBoundary } from "@/components/error-boundary";
import { PageTransition } from "@/components/page-transition";

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
        </Providers>
      </body>
    </html>
  );
}

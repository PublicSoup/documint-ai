import Link from "next/link";
import { ShieldCheck, Lock, FileCheck2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-[#030014] text-white px-6 py-16">
      <div className="max-w-6xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-3">Security</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Enterprise-grade security posture</h1>
        <p className="text-white/60 text-lg max-w-3xl mb-12">
          DocuMint AI is built with strict validation, authenticated access controls, rate limiting, and auditable
          mutation workflows to support production delivery requirements.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card className="glass-card border-white/10 bg-black/20">
            <CardHeader>
              <ShieldCheck className="w-6 h-6 text-primary mb-2" />
              <CardTitle>Secure by default</CardTitle>
            </CardHeader>
            <CardContent className="text-white/60">
              API routes are progressively hardened with validation, authorization checks, and standardized failure envelopes.
            </CardContent>
          </Card>

          <Card className="glass-card border-white/10 bg-black/20">
            <CardHeader>
              <Lock className="w-6 h-6 text-primary mb-2" />
              <CardTitle>Controlled access</CardTitle>
            </CardHeader>
            <CardContent className="text-white/60">
              Team and user scopes are enforced with explicit permission checks for read and mutation operations.
            </CardContent>
          </Card>

          <Card className="glass-card border-white/10 bg-black/20">
            <CardHeader>
              <FileCheck2 className="w-6 h-6 text-primary mb-2" />
              <CardTitle>Auditable changes</CardTitle>
            </CardHeader>
            <CardContent className="text-white/60">
              Critical mutations include audit logging to improve traceability and operational accountability.
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3">
          <Link href="/auth/register?source=security_page&intent=trial&plan=pro">
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-xl">Start Free Trial</Button>
          </Link>
          <Link href="/contact">
            <Button variant="outline" className="border-white/20 hover:bg-white/10 rounded-xl">Request Security Review</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Mail, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#030014] text-white px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-3">Contact Sales</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Talk to the DocuMint team</h1>
        <p className="text-white/60 text-lg max-w-3xl mb-10">
          We help engineering organizations deploy documentation automation with enterprise-grade reliability,
          security controls, and onboarding support.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <Card className="glass-card border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="text-white text-xl">Sales & onboarding</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-white/60 mb-5">Share your team size, current tooling, and timeline. We will reply within one business day.</p>
              <a href="mailto:sales@documint.ai" className="inline-flex items-center text-primary font-semibold hover:text-primary/80 transition-colors">
                <Mail className="w-4 h-4 mr-2" /> sales@documint.ai
              </a>
            </CardContent>
          </Card>

          <Card className="glass-card border-white/10 bg-black/20">
            <CardHeader>
              <CardTitle className="text-white text-xl">Security reviews</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-white/60 mb-5">Need security and compliance details for procurement? We support structured enterprise review workflows.</p>
              <a href="mailto:support@documint.ai" className="inline-flex items-center text-primary font-semibold hover:text-primary/80 transition-colors">
                <ShieldCheck className="w-4 h-4 mr-2" /> support@documint.ai
              </a>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3">
          <Link href="/auth/register?source=contact_page&intent=trial&plan=pro">
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-xl">
              Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="border-white/20 hover:bg-white/10 rounded-xl">Back to Home</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

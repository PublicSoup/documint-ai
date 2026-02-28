import { ArrowRight, BookOpen, Code2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrackedLink } from "@/components/marketing/tracked-link";

const docsSections = [
  {
    title: "Getting Started",
    description: "Create your account, generate your first documentation set, and ship from day one.",
    href: "/auth/register?source=docs_getting_started&intent=signup",
    cta: "Start Free",
    icon: Sparkles,
    eventName: "landing_primary_cta_click",
    location: "docs_getting_started",
  },
  {
    title: "Web IDE",
    description: "Use the in-browser IDE with AI workflows, file tree, and integrated execution tooling.",
    href: "/code",
    cta: "Open IDE",
    icon: Code2,
    eventName: "landing_secondary_cta_click",
    location: "docs_web_ide",
  },
  {
    title: "Security + Compliance",
    description: "Review enterprise controls, validation posture, and auditable mutation paths.",
    href: "/dashboard/settings",
    cta: "View Security Settings",
    icon: ShieldCheck,
    eventName: "landing_secondary_cta_click",
    location: "docs_security_compliance",
  },
] as const;

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#030014] text-white px-6 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-3">Documentation</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Build faster with production-ready guidance</h1>
          <p className="text-white/60 text-lg max-w-3xl">
            Everything you need to onboard quickly, run the AI IDE effectively, and keep enterprise-grade security controls in place.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {docsSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.title} className="glass-card border-white/10 bg-black/20">
                <CardHeader>
                  <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-white text-xl">{section.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-white/60 mb-6">{section.description}</p>
                  <TrackedLink
                    href={section.href}
                    eventName={section.eventName}
                    location={section.location}
                    variant="control"
                    className="inline-flex items-center text-primary font-semibold hover:text-primary/80 transition-colors"
                  >
                    {section.cta}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </TrackedLink>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="glass-card rounded-3xl border border-white/10 p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-bold mb-2">Need full implementation help?</p>
            <h2 className="text-2xl md:text-3xl font-black">Launch with DocuMint AI and keep docs in sync automatically.</h2>
          </div>
          <div className="flex gap-3">
            <TrackedLink
              href="/auth/register?source=docs_final_cta&intent=trial&plan=pro"
              eventName="landing_final_cta_click"
              location="docs_final_cta"
              variant="control"
            >
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-xl">
                Start Free Trial
              </Button>
            </TrackedLink>
            <TrackedLink
              href="/"
              eventName="landing_secondary_cta_click"
              location="docs_back_home"
              variant="control"
            >
              <Button variant="outline" className="border-white/20 hover:bg-white/10 rounded-xl">
                <BookOpen className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </TrackedLink>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import React from "react";
import { motion } from "framer-motion";
import { FileCode2, Zap, Shield, Globe, ArrowRight, Github, CheckCircle, Terminal, Bot, Sparkles } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  const { data: session } = useSession();

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/5 px-6 py-4 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-all duration-300">
              <FileCode2 className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">DocuMint AI</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
            <a href="#features" className="hover:text-white transition-colors relative group">
              Features
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all group-hover:w-full"></span>
            </a>
            <a href="#pricing" className="hover:text-white transition-colors relative group">
              Pricing
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all group-hover:w-full"></span>
            </a>
          </div>
          <div className="flex items-center gap-4">
            {session ? (
              <Link href="/dashboard">
                <Button variant="primary" className="shadow-lg shadow-primary/25">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Button variant="ghost" onClick={() => signIn()}>Log in</Button>
                <Button variant="primary" onClick={() => signIn()} className="shadow-lg shadow-primary/25">Get Started</Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-grow pt-32">
        {/* Hero Section */}
        <section className="relative px-6 py-20 lg:py-32 overflow-hidden">
          {/* Animated Background Elements */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/20 blur-[130px] rounded-full -z-10 opacity-30 animate-pulse-glow" />
          <div className="absolute bottom-0 right-0 w-[800px] h-[400px] bg-purple-600/10 blur-[120px] rounded-full -z-10 opacity-20" />

          <div className="max-w-6xl mx-auto text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/10 mb-8 animate-fade-in">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-white/80">Premium Documentation for Premium Code</span>
              </div>

              <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-8 leading-tight">
                Documentation that <br />
                <span className="text-gradient-primary">understands</span> your code.
              </h1>
              <p className="text-lg md:text-xl text-white/60 mb-12 max-w-2xl mx-auto leading-relaxed">
                Automatically generate comprehensive documentation, inline comments, and architecture maps using context-aware AI that actually reads your code.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <Button
                  size="lg"
                  onClick={() => window.location.href = "/auth/register"}
                  rightIcon={<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                  className="group text-lg px-8 py-6 h-auto shadow-[0_0_40px_-10px_rgba(124,58,237,0.5)] hover:shadow-[0_0_60px_-10px_rgba(124,58,237,0.7)]"
                >
                  Start Documenting Free
                </Button>

                <Button
                  variant="glass"
                  size="lg"
                  leftIcon={<Github className="w-5 h-5" />}
                  className="text-lg px-8 py-6 h-auto"
                >
                  View on GitHub
                </Button>
              </div>
            </motion.div>

            {/* Mockup Preview */}
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
              className="mt-24 relative max-w-5xl mx-auto"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative glass-card p-2 rounded-2xl overflow-hidden shadow-2xl">
                <div className="bg-[#0a0a0c]/90 rounded-xl overflow-hidden border border-white/5 aspect-[16/9] flex shadow-inner">
                  {/* Sidebar */}
                  <div className="w-64 border-r border-white/5 p-4 flex-col gap-4 hidden md:flex bg-black/20">
                    <div className="flex gap-2 mb-4">
                      <div className="w-3 h-3 rounded-full bg-red-500/80" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                      <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                        <div className="pl-4 space-y-2">
                          <div className="h-3 w-1/2 bg-white/5 rounded opacity-50" />
                          <div className="h-3 w-2/3 bg-white/5 rounded opacity-50" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Main Code Area */}
                  <div className="flex-grow p-8 text-left font-mono text-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                      <div className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs border border-primary/30 flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        AI Generating...
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex gap-4">
                        <span className="text-white/20 select-none">01</span>
                        <span className="text-purple-400">/**</span>
                      </div>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 2, delay: 1 }}
                      >
                        <div className="flex gap-4">
                          <span className="text-white/20 select-none">02</span>
                          <span className="text-purple-400"> * <span className="text-green-400">@function</span> generateContext</span>
                        </div>
                        <div className="flex gap-4">
                          <span className="text-white/20 select-none">03</span>
                          <span className="text-purple-400"> * <span className="text-blue-300">Analysis:</span> Analyzes code abstract syntax tree</span>
                        </div>
                        <div className="flex gap-4">
                          <span className="text-white/20 select-none">04</span>
                          <span className="text-purple-400"> * <span className="text-blue-300">Returns:</span> Context object for LLM processing</span>
                        </div>
                        <div className="flex gap-4">
                          <span className="text-white/20 select-none">05</span>
                          <span className="text-purple-400"> */</span>
                        </div>
                      </motion.div>

                      <div className="flex gap-4 mt-2">
                        <span className="text-white/20 select-none">06</span>
                        <span className="text-pink-400">export</span> <span className="text-blue-400">async</span> <span className="text-pink-400">function</span> <span className="text-yellow-200">generateContext</span>() {"{"}
                      </div>
                      <div className="flex gap-4">
                        <span className="text-white/20 select-none">07</span>
                        <span className="pl-8 text-white">const context = <span className="text-pink-400">await</span> analyzer.<span className="text-blue-400">analyze</span>(code);</span>
                      </div>
                      <div className="flex gap-4">
                        <span className="text-white/20 select-none">08</span>
                        <span className="pl-8 text-pink-400">return</span> <span className="text-white">context;</span>
                      </div>
                      <div className="flex gap-4">
                        <span className="text-white/20 select-none">09</span>
                        <span className="text-white">{"}"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="relative px-6 py-32 bg-secondary/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Why developers love DocuMint</h2>
              <p className="text-white/50 max-w-2xl mx-auto text-lg">Built by developers, for developers. We understand the pain of documentation.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: <Zap className="text-yellow-400 w-8 h-8" />,
                  title: "Insane Speed",
                  desc: "Document entire repositories in minutes, not days. Powered by optimized local AI models.",
                  color: "bg-yellow-400/10"
                },
                {
                  icon: <Shield className="text-green-400 w-8 h-8" />,
                  title: "100% Private",
                  desc: "Your code never leaves your machine. Local AI processing keeps everything secure and compliant.",
                  color: "bg-green-400/10"
                },
                {
                  icon: <Globe className="text-blue-400 w-8 h-8" />,
                  title: "Multi-Language",
                  desc: "Native support for Python, JavaScript, TypeScript, Go, Rust, and more with semantic understanding.",
                  color: "bg-blue-400/10"
                }
              ].map((feature, i) => (
                <Card key={i} className="group overflow-hidden border-white/5 bg-white/5 hover:bg-white/10 transition-all duration-500">
                  <CardContent className="p-8">
                    <div className={`w-16 h-16 rounded-2xl ${feature.color} flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500`}>
                      {feature.icon}
                    </div>
                    <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                    <p className="text-white/60 leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="px-6 py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/5 -skew-y-3 transform origin-top-left scale-110" />

          <div className="max-w-7xl mx-auto relative z-10">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Loved by developers worldwide</h2>
              <p className="text-white/50 text-lg">Join thousands of developers who save hours every week.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { name: "Sarah Chen", role: "Senior Engineer @ Stripe", quote: "DocuMint saved our team 20+ hours per week on documentation. The AI actually understands our codebase context." },
                { name: "Marcus Rodriguez", role: "Lead Developer @ Vercel", quote: "Finally, documentation that stays in sync with code! The regeneration feature is a game-changer for our CI/CD." },
                { name: "Emily Watson", role: "CTO @ TechStartup", quote: "We onboard new developers 3x faster now. The explanations are better than what most humans write." },
              ].map((testimonial, i) => (
                <Card key={i} className="border-white/10 bg-black/40 hover:border-primary/30 transition-colors">
                  <CardContent className="p-8">
                    <p className="text-white/80 mb-8 italic text-lg leading-relaxed">&quot;{testimonial.quote}&quot;</p>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                        {testimonial.name[0]}
                      </div>
                      <div>
                        <p className="font-bold text-white">{testimonial.name}</p>
                        <p className="text-sm text-primary/80">{testimonial.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="px-6 py-32 relative">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Simple, transparent pricing</h2>
              <p className="text-white/50 text-lg">Start free. Upgrade when you need more.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                { name: "Free", price: "$0", desc: "For hobbyists", limit: "10 files/month", features: ["Standard AI Documentation", "Basic Quality Scoring", "Markdown export"] },
                { name: "Pro", price: "$29", desc: "For power users", limit: "1,000 files/month", features: ["Everything in Free", "Enterprise Diagnostic Engine", "Security & Secret Audit", "Architecture Violation Alerts", "AI Refactoring Suggestions"], popular: true },
                { name: "Team", price: "$99", desc: "For enterprise teams", limit: "10,000 files/month", features: ["Everything in Pro", "Advanced Onboarding Metrics", "Performance Bottleneck Logic", "Team Collaboration", "Custom API Access"] },
              ].map((plan, i) => (
                <div key={i} className={`relative glass-card p-1 rounded-3xl transition-transform duration-300 ${plan.popular ? 'scale-105 z-10' : 'hover:scale-105'}`}>
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-primary to-purple-500 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg">Most Popular</div>
                  )}
                  <div className="h-full bg-[#0a0a0c] rounded-[22px] p-8 flex flex-col border border-white/5">
                    <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                    <p className="text-white/50 text-sm mb-6">{plan.desc}</p>
                    <div className="text-5xl font-bold mb-2 tracking-tight">{plan.price}<span className="text-lg font-normal text-white/40">/mo</span></div>
                    <p className="text-primary text-sm font-medium mb-8 bg-primary/10 w-fit px-3 py-1 rounded-full">{plan.limit}</p>

                    <ul className="space-y-4 mb-8 flex-grow">
                      {plan.features.map((f, idx) => (
                        <li key={idx} className="flex items-center gap-3 text-sm text-white/70">
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={plan.popular ? "primary" : "outline"}
                      className={`w-full py-6 text-lg ${!plan.popular && "bg-transparent border-white/20 hover:bg-white/5"}`}
                      onClick={() => signIn()}
                    >
                      Get Started
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-6 py-32">
          <div className="max-w-5xl mx-auto text-center">
            <div className="glass rounded-[40px] p-16 border border-white/10 relative overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10" />
              <div className="relative z-10">
                <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">Ready to stop writing manual docs?</h2>
                <p className="text-white/60 mb-10 max-w-xl mx-auto text-xl">Join thousands of developers who use DocuMint to generate consistency and save time.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button
                    size="lg"
                    onClick={() => window.location.href = "/auth/register"}
                    rightIcon={<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                    className="text-lg px-10 py-7 h-auto shadow-2xl"
                  >
                    Start for Free
                  </Button>
                </div>
                <p className="text-white/30 text-sm mt-6">No credit card required • Free tier forever</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-16 border-t border-white/5 px-6 bg-black/40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 text-white/40 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <FileCode2 className="text-white/60 w-5 h-5" />
            </div>
            <span className="font-bold text-white/60">DocuMint AI</span>
          </div>
          <div className="flex gap-10">
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">Discord</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </div>
          <p>© 2026 DocuMint AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

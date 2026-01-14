"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  Shield,
  Code2,
  Cpu,
  Globe,
  Github,
  ArrowRight,
  Terminal,
  FileCode,
  Sparkles,
  Command
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#030014] text-white selection:bg-primary/30 overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full animate-float" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-indigo-600/10 blur-[100px] rounded-full" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-black tracking-tighter text-white">
              DOCUMINT <span className="text-primary italic">AI</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
            <Link href="#features" className="hover:text-primary transition-colors">Features</Link>
            <Link href="#solutions" className="hover:text-primary transition-colors">Solutions</Link>
            <Link href="#pricing" className="hover:text-primary transition-colors">Pricing</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/auth/login">
              <Button variant="ghost" className="hover:bg-white/5">Log in</Button>
            </Link>
            <Link href="/auth/register">
              <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 rounded-full px-6">
                Get Started <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-primary-foreground/80 text-sm font-medium mb-8"
          >
            <Zap className="w-4 h-4 text-primary" />
            <span>The future of AI-powered development is here</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[1.1]"
          >
            Automate Your <br />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Workflow Magic.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-white/50 max-w-2xl mx-auto mb-12 leading-relaxed"
          >
            DocuMint AI is the ultimate productivity suite for developers. AI-generated docs, real-time code analysis, and a built-in intelligent IDE.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/auth/register">
              <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-white rounded-2xl shadow-2xl shadow-primary/40">
                Launch Dashboard <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="https://github.com" target="_blank">
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-white/10 hover:bg-white/5 rounded-2xl">
                <Github className="w-5 h-5 mr-2" /> View on GitHub
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Hero Preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-24 max-w-6xl mx-auto relative group"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 to-purple-600/30 blur-3xl opacity-20 group-hover:opacity-40 transition-opacity" />
          <div className="relative glass-card rounded-3xl overflow-hidden aspect-video border border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]">
            <div className="bg-white/5 px-6 py-4 flex items-center justify-between border-b border-white/5">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/50" />
              </div>
              <div className="text-xs font-medium text-white/30 tracking-widest uppercase">DOCUMINT AI - CLOUD IDE</div>
              <div className="w-12" />
            </div>
            <div className="grid grid-cols-12 h-full">
              <div className="col-span-3 border-r border-white/5 p-6 bg-black/20">
                <div className="space-y-4">
                  <div className="w-full h-4 bg-white/5 rounded animate-pulse" />
                  <div className="w-3/4 h-4 bg-white/5 rounded animate-pulse" />
                  <div className="w-full h-4 bg-white/5 rounded animate-pulse" />
                  <div className="w-1/2 h-4 bg-white/5 rounded animate-pulse" />
                </div>
              </div>
              <div className="col-span-9 p-8 flex flex-col items-center justify-center text-center">
                <Terminal className="w-16 h-16 text-primary/40 mb-6" />
                <h3 className="text-2xl font-bold mb-2">Initialize Project</h3>
                <p className="text-white/40 mb-8">Run 'documint init' to start your journey</p>
                <div className="px-6 py-3 rounded-xl bg-black/40 border border-white/10 font-mono text-primary text-sm">
                  $ npx documint-ai@latest dev
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 italic italic-accent">Engineered for Excellence</h2>
            <p className="text-white/40 text-lg max-w-2xl mx-auto">
              We've built all the tools you need to build faster, smarter, and with complete visibility.
            </p>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              {
                icon: <Code2 className="w-8 h-8" />,
                title: "Cloud IDE",
                description: "A full VS-Code style experience in your browser with real-time AI assistance."
              },
              {
                icon: <Sparkles className="w-8 h-8" />,
                title: "AI Documentation",
                description: "Instantly generate human-readable docs from your source code using advanced LLMs."
              },
              {
                icon: <Cpu className="w-8 h-8" />,
                title: "Agentic Workflows",
                description: "AI agents that can fix bugs, refactor code, and run tests autonomously."
              },
              {
                icon: <Shield className="w-8 h-8" />,
                title: "Enterprise Security",
                description: "Bank-grade encryption and isolation for your sensitive codebase and secrets."
              },
              {
                icon: <Globe className="w-8 h-8" />,
                title: "Universal Support",
                description: "Support for 20+ languages including TS, Python, Rust, Go, and Java."
              },
              {
                icon: <Command className="w-8 h-8" />,
                title: "CLI Power",
                description: "Deploy and manage your environment from any terminal with our CLI tool."
              }
            ].map((feature, i) => (
              <motion.div key={i} variants={fadeInUp}>
                <Card className="glass-card h-full border-white/5 hover:border-primary/30 group">
                  <CardContent className="p-8">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform duration-500">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
                    <p className="text-white/40 leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-40 px-6 relative">
        <div className="max-w-4xl mx-auto glass-card rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] -z-10" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600/20 blur-[100px] -z-10" />

          <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight">
            Ready to build the <br />
            <span className="text-primary italic">next big thing?</span>
          </h2>
          <p className="text-xl text-white/50 mb-12">
            Join 50,000+ developers building with DocuMint AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/auth/register">
              <Button size="lg" className="h-14 px-10 text-lg bg-white text-black hover:bg-white/90 rounded-2xl">
                Get Started Free
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="h-14 px-10 text-lg border-white/20 hover:bg-white/10 rounded-2xl">
                Contact Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-white/5 bg-black/40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-10">
          <div className="space-y-4 text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-black tracking-tighter">DOCUMINT AI</span>
            </div>
            <p className="text-white/30 text-sm max-w-xs">
              Empowering engineers with autonomous AI agents and intelligent documentation.
            </p>
            <div className="pt-4 flex flex-col gap-2 text-xs text-white/40">
              <span className="uppercase tracking-[0.2em] font-black text-white/20">Contact Support</span>
              <Link href="mailto:support@documint.ai" className="hover:text-primary transition-colors text-sm font-medium">support@documint.ai</Link>
            </div>
          </div>

          <div className="flex gap-16 text-sm text-white/40">
            <div className="flex flex-col gap-4">
              <span className="font-bold text-white uppercase text-xs tracking-widest">Product</span>
              <Link href="#features" className="hover:text-primary transition-colors">Features</Link>
              <Link href="#pricing" className="hover:text-primary transition-colors">Pricing</Link>
              <Link href="/docs" className="hover:text-primary transition-colors">Documentation</Link>
            </div>
            <div className="flex flex-col gap-4">
              <span className="font-bold text-white uppercase text-xs tracking-widest">Legal</span>
              <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
              <Link href="/refund" className="hover:text-primary transition-colors">Refund Policy</Link>
            </div>
          </div>

          <div className="flex gap-4">
            <Button size="icon" variant="ghost" className="w-10 h-10 rounded-full hover:bg-white/5 border border-white/5">
              <Github className="w-5 h-5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-10 h-10 rounded-full hover:bg-white/5 border border-white/5">
              <Globe className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-20 flex flex-col md:flex-row justify-between items-center gap-4 text-white/20 text-[10px] tracking-widest uppercase font-bold">
          <div>© 2026 DocuMint AI Inc. All rights reserved.</div>
          <div className="flex gap-6">
            <span>SECURE PAYMENTS BY STRIPE</span>
            <span>AI POWERED BY QWEN 2.5</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
<img src="public/documint-banner.svg" alt="DocuMint AI" width="100%" />

# DocuMint AI

**AI-powered documentation generation for your codebase.** Upload code, get beautiful docs. Powered by local AI (Qwen 2.5 Coder via LM Studio).

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/your-org/documint)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)

---

## ✨ Features

- 🤖 **AI-Powered Analysis** - Generates comprehensive documentation using Qwen 2.5 Coder
- 📊 **Code Quality Scoring** - Get a 0-100 quality score with actionable insights
- 🔒 **Security Insights** - Detect potential vulnerabilities in your code
- 👥 **Team Collaboration** - Share docs, comment with @mentions, role-based access
- 🐙 **GitHub Integration** - Push docs as PRs directly to your repos
- 📝 **Multiple Export Formats** - Markdown, HTML, JSON, or push to GitHub
- 🎭 **Documentation Personas** - Explanations for junior devs, seniors, or stakeholders
- 🔮 **Code Archaeology** - Understand legacy code with AI-powered analysis

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/documint-ai.git
cd documint-ai

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Set up database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## 📋 Requirements

- Node.js 18+
- PostgreSQL database
- [LM Studio](https://lmstudio.ai/) running with a code model (e.g., Qwen 2.5 Coder)

## 🔧 Configuration

See [`.env.example`](.env.example) for all available environment variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Secret for NextAuth.js |
| `LM_STUDIO_URL` | No | LM Studio API URL (default: `http://localhost:1234/v1`) |
| `GITHUB_CLIENT_ID` | No | For GitHub OAuth integration |
| `STRIPE_SECRET_KEY` | No | For subscription billing |

## 📖 Documentation

- [API Reference](API_REFERENCE.md) - Public API documentation
- [Deployment Guide](DEPLOYMENT.md) - How to deploy to production
- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [LM Studio Setup](LM_STUDIO_SETUP.md) - Setting up local AI

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│   PostgreSQL     │     │   LM Studio     │
│   (Frontend +   │     │   (Database)     │     │   (Local AI)    │
│    API Routes)  │     └──────────────────┘     └─────────────────┘
└─────────────────┘              │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Tree-sitter   │     │     Prisma       │     │   Qwen 2.5      │
│   (Parsing)     │     │     (ORM)        │     │   Coder Model   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## 🎯 Roadmap

See [TODO.md](TODO.md) for the full roadmap.

**Current Focus:**
- [x] Team Collaboration
- [x] GitHub PR Integration
- [x] Public API with Rate Limiting
- [ ] VS Code Extension
- [ ] CLI Tool

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ by the DocuMint Team
</p>

# DocuMint AI - Contributing Guide

Thank you for your interest in contributing to DocuMint AI! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- LM Studio (for local AI)
- Git

### Local Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/documint-ai.git
   cd documint-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── analyze/       # Code analysis
│   │   ├── comments/      # Comment system
│   │   ├── github/        # GitHub integration
│   │   ├── notifications/ # Notification system
│   │   ├── teams/         # Team management
│   │   └── v1/            # Public API (versioned)
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Main dashboard
│   └── invite/            # Invite acceptance
├── components/            # React components
│   ├── doc-editor.tsx     # Documentation editor
│   ├── file-upload.tsx    # File upload with drag/drop
│   ├── team-switcher.tsx  # Team workspace switcher
│   └── ...
├── lib/                   # Utility libraries
│   ├── auth.ts            # NextAuth configuration
│   ├── db.ts              # Prisma client
│   └── rate-limit.ts      # Rate limiting utilities
└── prisma/
    └── schema.prisma      # Database schema
```

## 🔧 Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add comments for complex logic

### Component Guidelines

```tsx
// Good - Functional component with TypeScript
interface ButtonProps {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
}

export default function Button({ label, onClick, variant = "primary" }: ButtonProps) {
    return (
        <button onClick={onClick} className={`btn-${variant}`}>
            {label}
        </button>
    );
}
```

### API Route Guidelines

```typescript
// Always include:
// 1. Authentication check
// 2. Input validation
// 3. Error handling
// 4. Proper status codes

export async function POST(req: Request) {
    try {
        // 1. Auth check
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Input validation
        const body = await req.json();
        const validated = schema.parse(body);

        // 3. Business logic
        const result = await db.model.create({ ... });

        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        // 4. Error handling
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error("API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
```

### Database Changes

1. Update `prisma/schema.prisma`
2. Run `npx prisma generate`
3. Run `npx prisma db push` (development) or create a migration
4. Update relevant API routes and components

## 🧪 Testing

```bash
# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm run test -- path/to/test.spec.ts
```

## 📝 Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, documented code
   - Add tests if applicable
   - Update documentation if needed

3. **Test locally**
   ```bash
   npm run build
   npm run lint
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: add user avatar upload"
   git commit -m "fix: resolve team invite race condition"
   git commit -m "docs: update API reference"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **In your PR description:**
   - Describe what changes you made
   - Link relevant issues
   - Include screenshots for UI changes

## 🐛 Reporting Issues

When reporting bugs, please include:

1. **Description** - Clear description of the issue
2. **Steps to Reproduce** - Numbered steps to reproduce
3. **Expected Behavior** - What should happen
4. **Actual Behavior** - What actually happens
5. **Environment** - OS, browser, Node version
6. **Screenshots** - If applicable

## 📋 Feature Requests

For feature requests, please describe:

1. **The Problem** - What problem does this solve?
2. **Proposed Solution** - How should it work?
3. **Alternatives** - Other ways to solve this
4. **Additional Context** - Mockups, examples, etc.

## 🏗️ Architecture Decisions

### Why Next.js App Router?
- Server components for better performance
- Built-in API routes
- Excellent TypeScript support
- Easy deployment to Vercel

### Why Prisma?
- Type-safe database queries
- Easy migrations
- Great DX with auto-completion

### Why LM Studio for AI?
- Local AI = privacy + no API costs
- Supports latest open-source models
- Easy to swap models

## 📜 License

By contributing, you agree that your contributions will be licensed under the project's MIT License.

---

Thank you for contributing! 🎉

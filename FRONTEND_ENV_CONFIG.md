# Frontend Environment Configuration for DocuMint AI

Copy the values below to your `.env.local` file in the project root.

## LM Studio API Configuration

```bash
NEXT_PUBLIC_LM_STUDIO_URL=http://localhost:1234/v1
NEXT_PUBLIC_LM_STUDIO_MODEL_NAME=auto
```

## Backend API

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## NextAuth.js Authentication

```bash
# Generate with: openssl rand -hex 32
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=http://localhost:3000
```

## Database (Prisma)

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/documint
```

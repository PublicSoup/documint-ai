# Performance Optimization Plan

## 1. Database Optimization
- [ ] Add indices to frequent lookup columns in `schema.prisma`.
  - `File`: `[userId]`, `[teamId]`, `[createdAt]`
  - `DocView`: `[fileId]`, `[createdAt]`
  - `AuditLog`: `[createdAt]`, `[entityId]`
- [ ] Run `prisma db push` to apply changes.

## 2. Server-Side Optimization
- [ ] Implement pagination in `DashboardPage` (currently fetches ALL files).
- [ ] Add `fetch` caching strategies where appropriate (though most dashboard data is dynamic).

## 3. Client-Side Optimization
- [ ] Lazy load heavy components (e.g., `DocEditor` only when needed, though it's already conditional).
- [ ] Ensure images are optimized (using `next/image`).

## 4. Infrastructure
- [ ] Verify `next.config.ts` has `swcMinify: true` (default in recent Next.js, but good to check).
- [ ] Ensure Cloudflare Tunnel is running efficiently (we are hitting it hard).

## 5. AI Interaction
- [ ] Ensure AI calls are asynchronous and don't block the main thread (already doing this via workers/jobs conceptually, but API routes need to be careful).

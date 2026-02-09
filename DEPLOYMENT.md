# Production Deployment Checklist

> **Status**: Ready for Production Deployment
> **Last Updated**: 2026-01-30

## ✅ Completed Production Improvements

### Phase 1: Environment Configuration
- [x] Type-safe environment variables with Zod validation
- [x] All 30+ environment variables validated at startup
- [x] Removed LM Studio references
- [x] Google Gemini as primary AI backend
- [x] Updated `.env.example` with all required variables

### Phase 2: API Security & Standardization
- [x] Created `api-utils.ts` with standardized error handling
- [x] Created `auth-guards.ts` with authentication helpers
- [x] Upgraded rate limiting with Upstash Redis support
- [x] Added auth rate limiting (5 requests/15min per IP)
- [x] Enhanced password validation (uppercase, lowercase, number)
- [x] Refactored critical routes with new patterns

### Phase 3: Database Performance
- [x] Added 9 performance indexes:
  - File (language, userId, teamId, createdAt)
  - Comment (fileId, userId)
  - Notification (userId+read composite, createdAt)
  - AuditLog (action, entity, userId, createdAt)
- [x] Created migration file
- [x] Prisma schema validated

### Phase 4: Production Monitoring
- [x] Created `/api/health` endpoint
- [x] Health checks for: database, AI, Redis, email, Stripe

---

## 📋 Pre-Deployment Checklist

### Environment Variables (Vercel/Hosting Platform)

#### Required Variables ⚠️
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `NEXTAUTH_SECRET` - **32+ character random string**
- [ ] `NEXTAUTH_URL` - Production domain (e.g., `https://documint.ai`)
- [ ] `NEXT_PUBLIC_APP_URL` - Same as NEXTAUTH_URL
- [ ] `GOOGLE_API_KEY` - Google Gemini API key
- [ ] `STRIPE_SECRET_KEY` - Stripe production secret key
- [ ] `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- [ ] `STRIPE_PRICE_ID_STARTER` - Stripe price ID
- [ ] `STRIPE_PRICE_ID_PRO` - Stripe price ID
- [ ] `STRIPE_PRICE_ID_TEAM` - Stripe price ID

#### Optional but Recommended
- [ ] `UPSTASH_REDIS_REST_URL` - For production rate limiting
- [ ] `UPSTASH_REDIS_REST_TOKEN` - For production rate limiting
- [ ] `RESEND_API_KEY` - For email notifications
- [ ] `EMAIL_FROM` - Sender email address
- [ ] `SUPABASE_URL` - If using Supabase storage
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - If using Supabase storage

#### OAuth Providers (if enabled)
- [ ] `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET`
- [ ] `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`
- [ ] `GITLAB_CLIENT_ID` & `GITLAB_CLIENT_SECRET`
- [ ] `GITHUB_WEBHOOK_SECRET` - For GitHub integration

### Database Migrations
- [ ] Backup production database
- [ ] Run `npx prisma migrate deploy` on production
- [ ] Verify index migration applied:
  ```sql
  -- Check indexes
  SELECT tablename, indexname FROM pg_indexes 
  WHERE schemaname = 'public' 
  ORDER BY tablename, indexname;
  ```

### Third-Party Service Configuration

#### Stripe
- [ ] Switch to production API keys (not test keys)
- [ ] Configure webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
- [ ] Verify webhook events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Test checkout flow in production mode

#### OAuth Apps
- [ ] Update GitHub OAuth app callback URL: `https://yourdomain.com/api/auth/callback/github`
- [ ] Update Google OAuth app callback URL: `https://yourdomain.com/api/auth/callback/google`
- [ ] Update GitLab OAuth app callback URL (if using)
- [ ] Verify authorized domains in OAuth consoles

#### Resend (Email)
- [ ] Verify domain ownership
- [ ] Add SPF/DKIM records to DNS
- [ ] Send test email to verify deliverability

### Security Checklist
- [ ] `NEXTAUTH_SECRET` is 32+ characters and cryptographically random
  ```bash
  # Generate with:
  openssl rand -base64 32
  ```
- [ ] All API keys are production (not development/test)
- [ ] CORS is configured for production domain only
- [ ] HTTPS is enforced (Vercel does this automatically)
- [ ] Rate limiting is enabled (Redis configured)
- [ ] Cookie `secure` flag is set in production

### Testing Checklist

#### Critical Flows
- [ ] User registration with email
- [ ] User login with email/password
- [ ] OAuth login (GitHub, Google)
- [ ] Stripe checkout (Starter, Pro, Team plans)
- [ ] Subscription management (upgrade, cancel)
- [ ] File upload and processing
- [ ] AI documentation generation
- [ ] GitHub repository integration
- [ ] Webhook processing (Stripe, GitHub)

#### Health Checks
- [ ] Visit `/api/health` - should return 200 OK
- [ ] Verify database status: "healthy"
- [ ] Verify all services: "configured"

### Performance Checks
- [ ] Lighthouse score > 90
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3.5s
- [ ] Database query times < 500ms (check slow query log)

### Monitoring Setup
- [ ] Set up uptime monitoring (e.g., Better Uptime, UptimeRobot)
- [ ] Configure error tracking (e.g., Sentry)
- [ ] Set up log aggregation (Vercel logs or external)
- [ ] Create alerts for:
  - Website downtime
  - Database connection failures
  - High error rates (> 1%)
  - Slow response times (> 2s)

---

## 🚀 Deployment Steps

### 1. Pre-Deployment
```bash
# 1. Run full build locally
npm run build

# 2. Check for TypeScript errors
npx tsc --noEmit

# 3. Validate Prisma schema
npx prisma validate

# 4. Generate Prisma client
npx prisma generate
```

### 2. Deploy to Vercel
```bash
# Option A: Push to main branch (auto-deploy)
git add .
git commit -m "Production ready: Security, performance, monitoring"
git push origin main

# Option B: Manual deployment
vercel --prod
```

### 3. Post-Deployment
```bash
# 1. Run database migrations
vercel env pull .env.production
npx prisma migrate deploy

# 2. Verify health endpoint
curl https://yourdomain.com/api/health

# 3. Test critical flows (see Testing Checklist)
```

### 4. Monitor
- [ ] Watch error logs for first 24 hours
- [ ] Monitor database performance
- [ ] Check Stripe webhook logs
- [ ] Verify email deliverability

---

## 🔧 Post-Launch Optimizations (Optional)

### Performance
- [ ] Enable Vercel Edge Functions for static routes
- [ ] Add CDN for static assets
- [ ] Implement database connection pooling (PgBouncer)
- [ ] Add Redis caching for frequent queries

### Security
- [ ] Add WAF (Web Application Firewall)
- [ ] Implement CSRF tokens for forms
- [ ] Add content security policy (CSP) headers
- [ ] Enable subresource integrity (SRI)

### Monitoring
- [ ] Add custom metrics dashboard
- [ ] Set up A/B testing infrastructure
- [ ] Implement session replay (LogRocket, FullStory)
- [ ] Add performance profiling

### Features
- [ ] Add end-to-end tests (Playwright)
- [ ] Implement feature flags (LaunchDarkly)
- [ ] Add comprehensive logging
- [ ] Create status page (status.documint.ai)

---

## 📞 Support & Rollback

### Rollback Procedure
If critical issues are discovered:

```bash
# 1. Revert to previous deployment
vercel rollback [deployment-url]

# 2. Or revert git commit
git revert HEAD
git push origin main

# 3. Restore database if needed
# (Use your backup from Pre-Deployment step)
```

### Emergency Contacts
- Database: [Your Supabase/PlanetScale support]
- Hosting: [Vercel support]
- Payment: [Stripe support]

---

## ✅ Sign-Off

**Deployment Approved By**: __________________
**Date**: __________________
**Version**: __________________

**Notes**:

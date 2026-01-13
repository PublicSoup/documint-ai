# DocuMint AI - Deployment Guide

This guide covers multiple deployment options for DocuMint AI.

---

## 🏠 Option 1: Local Development with Cloudflare Tunnel (Recommended)

Since DocuMint uses LM Studio for **free local AI inference**, this is the most cost-effective option.

### Architecture
```
User → https://documint.ai → Cloudflare Edge → Tunnel → Your Local Machine
                                                           ├── Next.js (port 3000)
                                                           └── LM Studio (port 1234)
```

### Prerequisites
- Ubuntu/Linux machine with 16GB+ RAM
- LM Studio running with Qwen 2.5 Coder model
- Node.js 18+
- PostgreSQL database

### Step 1: Set Up the Application

```bash
# Clone and install
git clone https://github.com/your-org/documint-ai.git
cd documint-ai
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Set up database
npx prisma generate
npx prisma db push

# Build for production
npm run build
```

### Step 2: Install Cloudflare Tunnel

```bash
# Add Cloudflare GPG key
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

# Add repository
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

# Install
sudo apt-get update && sudo apt-get install cloudflared

# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create documint-tunnel
```

### Step 3: Configure Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <Your-Tunnel-UUID>
credentials-file: /home/your-user/.cloudflared/<Your-Tunnel-UUID>.json

ingress:
  - hostname: documint.ai
    service: http://localhost:3000
  - hostname: www.documint.ai
    service: http://localhost:3000
  - service: http_status:404
```

### Step 4: Route DNS

```bash
cloudflared tunnel route dns documint-tunnel documint.ai
cloudflared tunnel route dns documint-tunnel www.documint.ai
```

### Step 5: Run Everything

```bash
# Terminal 1: Start LM Studio (GUI) or use CLI
lmstudio-cli serve --model qwen2.5-coder-7b-instruct

# Terminal 2: Start Next.js
npm start

# Terminal 3: Start Cloudflare Tunnel
cloudflared tunnel run documint-tunnel
```

### Step 6: Run as Services (Optional)

Create systemd services for auto-start:

```bash
# /etc/systemd/system/documint.service
[Unit]
Description=DocuMint AI
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/documint-ai
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable documint
sudo systemctl start documint
```

---

## ☁️ Option 2: Deploy to Vercel (Frontend) + External AI

Best for: Production apps with paid AI APIs (OpenAI, Anthropic)

### Step 1: Prepare for Vercel

Update environment to use cloud AI:

```env
# .env.production
DATABASE_URL=postgresql://user:pass@your-db-host:5432/documint
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-secret

# Option A: Use OpenAI instead of LM Studio
OPENAI_API_KEY=sk-...
AI_PROVIDER=openai

# Option B: Use hosted LM Studio via tunnel
LM_STUDIO_URL=https://api.your-tunnel.com
```

### Step 2: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add DATABASE_URL
vercel env add NEXTAUTH_SECRET
# ... add all required env vars
```

### Step 3: Set Up Database

Use a hosted PostgreSQL:
- **Neon** (free tier): https://neon.tech
- **Supabase** (free tier): https://supabase.com
- **Railway**: https://railway.app

---

## 🐳 Option 3: Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/documint
      - NEXTAUTH_URL=http://localhost:3000
      - NEXTAUTH_SECRET=your-secret
      - LM_STUDIO_URL=http://host.docker.internal:1234/v1
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=documint
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Run with Docker

```bash
# Build and run
docker-compose up -d

# Run migrations
docker-compose exec app npx prisma db push
```

---

## 🌐 Option 4: VPS Deployment (DigitalOcean/Hetzner)

### Step 1: Provision Server

- Ubuntu 22.04 LTS
- 4GB+ RAM (8GB recommended)
- 2 vCPUs

### Step 2: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser --interactive
sudo -u postgres createdb documint

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx for reverse proxy
sudo apt install -y nginx
sudo apt install -y certbot python3-certbot-nginx
```

### Step 3: Deploy Application

```bash
# Clone repo
git clone https://github.com/your-org/documint-ai.git
cd documint-ai

# Install and build
npm install
npm run build

# Start with PM2
pm2 start npm --name "documint" -- start
pm2 save
pm2 startup
```

### Step 4: Configure Nginx

```nginx
# /etc/nginx/sites-available/documint
server {
    listen 80;
    server_name documint.ai www.documint.ai;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/documint /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 5: SSL Certificate

```bash
sudo certbot --nginx -d documint.ai -d www.documint.ai
```

---

## 🔧 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_URL` | ✅ | Your app URL (e.g., https://documint.ai) |
| `NEXTAUTH_SECRET` | ✅ | Random 32+ char secret |
| `LM_STUDIO_URL` | No | LM Studio API (default: http://localhost:1234/v1) |
| `GITHUB_CLIENT_ID` | No | For GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | No | For GitHub OAuth |
| `STRIPE_SECRET_KEY` | No | For payments |
| `STRIPE_PUBLISHABLE_KEY` | No | For payments |
| `STRIPE_WEBHOOK_SECRET` | No | For webhooks |

---

## 🚨 AI Backend Options

### Local LM Studio (Free, Recommended)
- **Pros**: Free, private, no API costs
- **Cons**: Requires local hardware, can't scale
- **Best for**: Personal use, development, small teams

### OpenAI API (Paid)
- **Pros**: Easy, scalable, consistent
- **Cons**: $0.002-0.06 per 1K tokens
- **Best for**: Production SaaS with many users

### Anthropic Claude (Paid)
- **Pros**: Great for code understanding
- **Cons**: Similar pricing to OpenAI
- **Best for**: Complex code analysis

### Self-Hosted Ollama (Free)
- **Pros**: Like LM Studio but headless
- **Cons**: Requires GPU server for production
- **Best for**: Hybrid deployments

---

## ✅ Deployment Checklist

- [ ] Database migrated (`npx prisma db push`)
- [ ] Environment variables set
- [ ] LM Studio or AI API configured
- [ ] SSL certificate installed
- [ ] Stripe webhook configured (if using payments)
- [ ] GitHub OAuth callback URL set
- [ ] Rate limiting configured
- [ ] Monitoring set up (optional)
- [ ] Backups configured (database)

---

## 💰 Cost Comparison

| Deployment | Monthly Cost | AI Cost | Best For |
|------------|--------------|---------|----------|
| Local + Tunnel | $0 | $0 | Solo/Small team |
| Vercel + OpenAI | $0-20 | ~$50-200 | Growing SaaS |
| VPS + Local AI | $10-50 | $0 | Self-hosted |
| VPS + GPU + Ollama | $100-500 | $0 | High volume |

---

**Need help?** Open an issue on GitHub or join our Discord community.

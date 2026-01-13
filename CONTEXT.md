# DocuMint AI - Project Context & Vision

> **IMPORTANT**: This is the authoritative context document for AI assistants. Always reference before making changes.

---

## 🎯 Product Vision

**DocuMint** (codename: **Sentinel**) is an **enterprise-grade SaaS platform** for AI-powered code analysis that developers will pay for.

### Core Value Proposition
| Feature | Technology | Languages |
|---------|------------|-----------|
| **Security Vulnerability Detection** | Bandit (Python), Pattern-matching (JS/TS) | Python, JavaScript, TypeScript |
| **Cyclomatic Complexity Analysis** | Radon | Python |
| **Auto-Refactoring (PEP-8)** | Autopep8 | Python |
| **AI-Powered Explanations** | LM Studio + Mistral 7B (Local) | All |
| **Auto Language Detection** | Heuristic pattern matching | 20+ languages |

---

## ✅ Current API Capabilities (VERIFIED WORKING)

```
POST /api/v1/analyze
```

**Features:**
1. **Python Analysis**:
   - Cyclomatic complexity scoring (1-10)
   - Security scanning (70+ Bandit rules: B101-B703)
   - Syntax error detection (AST)
   - Auto-refactoring to PEP-8

2. **JavaScript/TypeScript Analysis**:
   - XSS detection (eval, innerHTML, document.write)
   - React-specific risks (dangerouslySetInnerHTML)
   - Console.log detection
   - Dynamic function creation warnings

3. **Generic Analysis (All Languages)**:
   - Hardcoded password/secret detection
   - API key exposure detection
   - TODO/FIXME marker detection

4. **Enterprise Features**:
   - Rate limiting (5 req/min free, 60 req/min pro)
   - JWT + API Key authentication
   - Async execution (non-blocking)
   - LLM integration (when LM Studio running)

---

## 💰 Business Model

| Tier | Price | Rate Limit | Features |
|------|-------|------------|----------|
| **Free** | $0 | 5/min | Basic analysis, Web UI |
| **Pro** | $19/mo | 60/min | API access, Priority LLM |
| **Enterprise** | $99/mo | Unlimited | Teams, SSO, Custom rules |

---

## 🏗️ Technical Architecture

### Backend (FastAPI + Python 3.12)
- **Location**: `/home/publicsoup/Desktop/New Folder/DocuMint/api`
- **Database**: SQLModel (SQLite dev → PostgreSQL prod)
- **AI**: LM Studio running Mistral 7B locally (`http://localhost:1234/v1`)

### Frontend (React + Vite + Tailwind)
- **Location**: `/home/publicsoup/Desktop/New Folder/DocuMint/web`
- **Styling**: Custom glassmorphism CSS
- **Editor**: Monaco Editor

### API Endpoints
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/analyze` | POST | Optional | Analyze code |
| `/api/v1/auth/signup` | POST | None | Register |
| `/api/v1/auth/token` | POST | None | Login (OAuth2) |
| `/api/v1/auth/users/me` | GET | JWT | Get profile |
| `/api/v1/apikeys/generate` | POST | JWT | Generate API key |
| `/api/v1/apikeys/revoke` | DELETE | JWT | Revoke API key |

---

## 🔐 Authentication

**Two Methods Supported:**
1. **JWT Bearer Token** (Web UI) - `Authorization: Bearer <token>`
2. **API Key** (External Tools) - `X-API-Key: csk_...`

---

## 🚀 Running the Project

```bash
# Backend
cd /home/publicsoup/Desktop/New\ Folder/DocuMint/api
source venv/bin/activate
uvicorn app.main:app --port 8000 --reload

# Frontend
cd /home/publicsoup/Desktop/New\ Folder/DocuMint/web
npm run dev

# LM Studio (for AI features)
# Start manually, load Mistral 7B, enable server on port 1234
```

---

## ⚠️ Design Rules (DO NOT CHANGE)

1. **Self-hosted LLM**: Uses Mistral via LM Studio, NOT cloud APIs
2. **Enterprise Focus**: Production-ready, not prototypes
3. **Premium UI**: Glassmorphism, gradients, animations
4. **Monetization First**: Every feature supports subscriptions

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `api/app/services/ai_service.py` | Core analysis (Radon, Bandit, LLM) |
| `api/app/core/security.py` | Password hashing, JWT |
| `api/app/api/endpoints/analyze.py` | Analysis endpoint |
| `api/app/api/deps.py` | Auth dependencies |
| `api/app/models.py` | Pydantic/SQLModel models |
| `web/src/context/AuthContext.jsx` | React auth state |
| `web/src/pages/AppPage.jsx` | Main editor UI |

---

*Last updated: January 8, 2026*

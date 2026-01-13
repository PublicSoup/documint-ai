# DocuMint AI Integration Guide

Complete guide for integrating and using the local Qwen 2.5 Coder model with DocuMint AI.

## Architecture Overview

```
┌─────────────────┐     HTTP API      ┌──────────────────┐
│   Next.js App   │ ◄──────────────► │  FastAPI Backend │
│  (Port 3000)    │                   │   (Port 8000)    │
└─────────────────┘                   └──────────────────┘
        │                                      │
        │ OpenAI                              │ OpenAI
        │ Client                              │ Client  
        │ SDK                                 │ (aiohttp)
        ▼                                     ▼
┌──────────────────────────────────────────────────────┐
│            LM Studio Local Server                    │
│              (Port 1234)                             │
│                                                      │
│  Model: Qwen 2.5 Coder 7B (Q5_K_M)                 │
└──────────────────────────────────────────────────────┘
```

## Integration Points

### 1. Backend Python Service (`api/app/services/ai_service.py`)

**Purpose**: Analyzes uploaded code files using static analysis + AI

**Key Features**:
- ✅ Auto-detects LM Studio model name via `/v1/models` endpoint
- ✅ Caches model name for performance
- ✅ Falls back gracefully if LM Studio is offline
- ✅ Optimized prompts for Qwen 2.5 Coder
- ✅ Runs static analysis (pylint, bandit) + LLM concurrently

**Configuration**:
```bash
# In api/.env or environment
LM_STUDIO_URL=http://localhost:1234
LM_STUDIO_MODEL_NAME=auto  # or specific model ID
```

**Usage Example**:
```python
from app.services.ai_service import AIService
from app.models import AnalyzeRequest

request = AnalyzeRequest(
    code='def hello(): return "world"',
    language='python'
)

result = await AIService.analyze_code(request)
# Returns: AnalyzeResponse with summary, suggestions, complexity_score
```

---

### 2. Frontend TypeScript Client (`src/lib/ai/client.ts`)

**Purpose**: Generates documentation for code snippets in the UI

**Key Features**:
- ✅ Auto-detects model name from LM Studio
- ✅ Client-side caching of model name
- ✅ Environment variable support
- ✅ Structured prompts for different documentation types

**Configuration**:
```bash
# In .env.local
NEXT_PUBLIC_LM_STUDIO_URL=http://localhost:1234/v1
NEXT_PUBLIC_LM_STUDIO_MODEL_NAME=auto
```

**Usage Example**:
```typescript
import { generateDocumentation } from '@/lib/ai/client';

const doc = await generateDocumentation(
    'function add(a, b) { return a + b; }',
    'javascript',
    'function'
);
// Returns: Markdown-formatted documentation string
```

---

## Testing the Integration

### Step 1: Verify LM Studio is Running

```bash
curl http://localhost:1234/v1/models
```

**Expected Output**:
```json
{
  "data": [
    {
      "id": "qwen2.5-coder-7b-instruct-q5_k_m",
      "object": "model"
    }
  ]
}
```

### Step 2: Test Backend Integration

```bash
cd /home/publicsoup/Desktop/AI\ app/api

# Start the FastAPI server
uvicorn app.main:app --reload
```

In another terminal:
```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)",
    "language": "python"
  }'
```

**Expected**: JSON response with AI-generated summary and suggestions.

### Step 3: Test Frontend Integration

```bash
cd /home/publicsoup/Desktop/AI\ app
npm run dev
```

1. Navigate to `http://localhost:3000/dashboard`
2. Upload a code file or paste code
3. Click "Generate Documentation"
4. Verify Qwen 2.5 Coder generates the docs

---

## Model Switching Guide

Want to try a different model? Here's how:

### Option 1: Auto-Detection (Recommended)

1. Load your desired model in LM Studio
2. Ensure `LM_STUDIO_MODEL_NAME=auto` in environment
3. Restart your app - it will detect the new model

### Option 2: Manual Configuration

1. Find the exact model ID:
   ```bash
   curl http://localhost:1234/v1/models | jq '.data[0].id'
   ```

2. Set in environment files:
   ```bash
   # Backend (api/.env)
   LM_STUDIO_MODEL_NAME=your-model-id-here
   
   # Frontend (.env.local)
   NEXT_PUBLIC_LM_STUDIO_MODEL_NAME=your-model-id-here
   ```

3. Restart both frontend and backend

---

## Performance Optimization

### Expected Response Times

| Code Size | Quantization | Expected Time |
|-----------|--------------|---------------|
| Small (~50 lines) | Q5_K_M | 3-5 seconds |
| Medium (~200 lines) | Q5_K_M | 8-15 seconds |
| Large (~500+ lines) | Q5_K_M | 20-30 seconds |

### Tips for Faster Inference

1. **Use GPU acceleration** (if available):
   - Enable in LM Studio settings → GPU offload
   - Dramatically reduces response time

2. **Adjust quantization**:
   - Q4_K_M: Faster, slightly lower quality
   - Q5_K_M: **Recommended** balance
   - Q8_0: Highest quality, slower

3. **Limit code length**:
   - Frontend truncates to 2000 chars for file summaries
   - Adjust in `client.ts` if needed

---

## Troubleshooting

### "Connection refused" errors

**Cause**: LM Studio server isn't running or wrong port

**Fix**:
```bash
# Check if LM Studio is listening
lsof -i :1234

# If not, start LM Studio and enable server
```

### Model auto-detection fails

**Cause**: CORS not enabled or model not loaded

**Fix**:
1. Open LM Studio → Server tab
2. Enable "CORS" toggle
3. Ensure model shows "Loaded" status

### Slow responses (>1 minute)

**Cause**: Insufficient RAM or CPU-only inference on large model

**Fix**:
1. Check RAM usage - close other apps
2. Try Q4_K_M quantization instead
3. Enable GPU offload in LM Studio

### JSON parsing errors in logs

**Cause**: Model outputting markdown code blocks around JSON

**Fix**: Already handled! Code strips ```json blocks automatically.

---

## Advanced Configuration

### Custom Prompts

To modify prompts for your use case:

**Backend**: Edit `ai_service.py` line 63-96  
**Frontend**: Edit `client.ts` line 48-102

### Timeout Adjustments

Default timeout: 10 seconds (backend), 30 seconds (frontend)

Increase for larger code files:
```python
# In ai_service.py, line 92
async with session.post(LM_STUDIO_URL, json=payload, timeout=30):  # Increased
```

### Temperature Control

Current: 0.1 (very deterministic)

- Lower (0.0-0.1): More consistent, less creative
- Higher (0.3-0.7): More varied, potentially creative

---

## Production Deployment

### Using a Different Port

```bash
# Environment variables
LM_STUDIO_URL=http://localhost:8080  # Custom port
```

Then configure LM Studio to use port 8080.

### Remote LM Studio Server

```bash
# Backend
LM_STUDIO_URL=http://your-server-ip:1234

# Frontend  
NEXT_PUBLIC_LM_STUDIO_URL=http://your-server-ip:1234/v1
```

**Security Note**: Only expose LM Studio on trusted networks. No authentication is required by default.

---

## API Reference

### Backend Endpoint: `/api/v1/analyze`

**Method**: POST

**Request Body**:
```json
{
  "code": "string (code to analyze)",
  "language": "python|javascript|typescript|..."
}
```

**Response**:
```json
{
  "summary": "AI-generated summary",
  "complexity_score": 5,
  "suggestions": [
    {
      "severity": "warning",
      "message": "Issue description",
      "suggestion": "How to fix",
      "line_number": 10
    }
  ],
  "refactored_code": "string or null"
}
```

### Frontend Function: `generateDocumentation()`

**Signature**:
```typescript
generateDocumentation(
  code: string,
  language: string,
  type: 'file' | 'function' | 'class' | 'complex_logic'
): Promise<string>
```

**Returns**: Markdown-formatted documentation string

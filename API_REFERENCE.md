# DocuMint AI - API Reference

Base URL: `https://your-domain.com/api/v1`

## Authentication

All API requests require an API key. Generate one from the Dashboard → Settings → API Keys.

Include your API key in the request headers:

```bash
X-API-Key: dk_your_key_here
```

Or use Bearer token authentication:

```bash
Authorization: Bearer dk_your_key_here
```

---

## Endpoints

### Analyze Code

Analyze source code and generate AI-powered documentation.

**Endpoint:** `POST /api/v1/analyze`

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-API-Key` | Yes | Your API key |
| `Content-Type` | Yes | `application/json` |

**Request Body:**
```json
{
  "code": "def hello(name):\n    return f'Hello, {name}!'",
  "language": "python",
  "filename": "greet.py"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Source code to analyze |
| `language` | string | No | Programming language (auto-detected if not provided) |
| `filename` | string | No | Filename for better language detection |

**Response:**
```json
{
  "success": true,
  "language": "python",
  "analysis": {
    "summary": "A greeting module with a single function...",
    "entities": [
      {
        "name": "hello",
        "type": "function",
        "purpose": "Returns a personalized greeting"
      }
    ],
    "securityIssues": [],
    "qualityScore": 85
  },
  "usage": {
    "remaining": 99,
    "resetAt": "2024-01-01T12:01:00.000Z"
  }
}
```

**Example with cURL:**
```bash
curl -X POST https://your-domain.com/api/v1/analyze \
  -H "X-API-Key: dk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function add(a, b) { return a + b; }",
    "language": "javascript"
  }'
```

---

## Rate Limits

| Plan | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Free | 10 | 100 |
| Starter | 60 | 1,000 |
| Pro | 100 | 10,000 |
| Team | 300 | Unlimited |

Rate limit headers are included in all responses:

```
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1704067260000
```

---

## Error Responses

**401 Unauthorized**
```json
{
  "error": "Invalid API key",
  "message": "The provided API key is not valid"
}
```

**429 Too Many Requests**
```json
{
  "error": "Rate limit exceeded",
  "remaining": 0,
  "resetAt": "2024-01-01T12:01:00.000Z"
}
```

**503 Service Unavailable**
```json
{
  "error": "AI service unavailable",
  "message": "Please ensure LM Studio is running"
}
```

---

## Supported Languages

DocuMint can analyze code in:

- Python (`.py`)
- JavaScript (`.js`, `.jsx`)
- TypeScript (`.ts`, `.tsx`)
- Go (`.go`)
- Rust (`.rs`)
- Java (`.java`)
- C# (`.cs`)
- Ruby (`.rb`)
- PHP (`.php`)
- Swift (`.swift`)
- Kotlin (`.kt`)
- C/C++ (`.c`, `.cpp`, `.h`)

---

## SDK Examples

### Python
```python
import requests

API_KEY = "dk_your_key_here"
BASE_URL = "https://your-domain.com/api/v1"

def analyze_code(code, language="python"):
    response = requests.post(
        f"{BASE_URL}/analyze",
        headers={"X-API-Key": API_KEY},
        json={"code": code, "language": language}
    )
    return response.json()

# Usage
result = analyze_code("def hello(): pass")
print(result["analysis"]["summary"])
```

### JavaScript/Node.js
```javascript
const API_KEY = "dk_your_key_here";
const BASE_URL = "https://your-domain.com/api/v1";

async function analyzeCode(code, language = "javascript") {
  const response = await fetch(`${BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code, language })
  });
  return response.json();
}

// Usage
const result = await analyzeCode("const add = (a, b) => a + b;");
console.log(result.analysis.summary);
```

### Go
```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

func analyzeCode(code, language string) (map[string]interface{}, error) {
    body, _ := json.Marshal(map[string]string{
        "code":     code,
        "language": language,
    })
    
    req, _ := http.NewRequest("POST", "https://your-domain.com/api/v1/analyze", bytes.NewBuffer(body))
    req.Header.Set("X-API-Key", "dk_your_key_here")
    req.Header.Set("Content-Type", "application/json")
    
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    return result, nil
}
```

---

## Webhooks (Coming Soon)

Configure webhooks to receive notifications when:
- Documentation is generated
- Quality score drops below threshold
- Security issues are detected

---

## Support

- Email: support@documint.ai
- GitHub: https://github.com/documint-ai/documint
- Discord: https://discord.gg/documint

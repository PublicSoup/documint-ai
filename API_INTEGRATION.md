# DocuMint API Integration Guide

This guide explains how to integrate the DocuMint API into your own tools (CLI, CI/CD pipelines, IDE extensions).

## 🔑 Authentication

DocuMint supports two authentication methods:

### 1. API Key (Recommended for Integrations)
Generate an API key from your dashboard and include it in requests:
```bash
curl -X POST "https://api.documint.ai/api/v1/analyze" \
  -H "X-API-Key: csk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"code": "def hello(): print(\"world\")", "language": "python"}'
```

### 2. Bearer Token (Web Sessions)
Used automatically by the web UI after login.

---

## 📋 API Endpoints

### Analyze Code
```
POST /api/v1/analyze
```

**Request Body:**
```json
{
  "code": "your code here",
  "language": "python",  // python, javascript, typescript, java, go, rust, etc.
  "context": ""          // optional additional context
}
```

**Response:**
```json
{
  "summary": "Code complexity is rated 3/10. Found 1 security vulnerability.",
  "complexity_score": 3,
  "suggestions": [
    {
      "line_number": 5,
      "severity": "critical",
      "message": "🔒 Shell Injection: Possible shell injection via subprocess",
      "suggestion": "Use subprocess with shell=False and pass args as list"
    }
  ],
  "refactored_code": "..."
}
```

### Generate API Key
```
POST /api/v1/apikeys/generate
Authorization: Bearer <jwt_token>
```

### Revoke API Key
```
DELETE /api/v1/apikeys/revoke
Authorization: Bearer <jwt_token>
```

---

## 🛠️ Integration Examples

### Python
```python
import requests

API_KEY = "csk_your_api_key_here"
API_URL = "https://api.documint.ai/api/v1/analyze"

def analyze_code(code: str, language: str = "python") -> dict:
    response = requests.post(
        API_URL,
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        json={"code": code, "language": language}
    )
    response.raise_for_status()
    return response.json()

# Example usage
result = analyze_code('''
def risky_function(user_input):
    import os
    os.system(user_input)  # Security risk!
''')

print(f"Summary: {result['summary']}")
for suggestion in result['suggestions']:
    print(f"[{suggestion['severity'].upper()}] Line {suggestion['line_number']}: {suggestion['message']}")
```

### JavaScript/Node.js
```javascript
const axios = require('axios');

const API_KEY = 'csk_your_api_key_here';
const API_URL = 'https://api.documint.ai/api/v1/analyze';

async function analyzeCode(code, language = 'javascript') {
  const response = await axios.post(API_URL, 
    { code, language },
    { headers: { 'X-API-Key': API_KEY } }
  );
  return response.data;
}

// Example
analyzeCode(`
  const password = "admin123";
  eval(userInput);
`).then(result => {
  console.log('Summary:', result.summary);
  result.suggestions.forEach(s => {
    console.log(`[${s.severity}] ${s.message}`);
  });
});
```

### Bash / CLI
```bash
#!/bin/bash
# documint-analyze.sh

API_KEY="csk_your_api_key_here"
FILE=$1
LANGUAGE=${2:-python}

CODE=$(cat "$FILE")

curl -s -X POST "https://api.documint.ai/api/v1/analyze" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"code\": $(echo "$CODE" | jq -Rs .), \"language\": \"$LANGUAGE\"}" | jq .
```

Usage:
```bash
./documint-analyze.sh myfile.py python
```

### GitHub Actions
```yaml
name: Code Analysis

on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Analyze Python Files
        env:
          CODESCRIBE_API_KEY: ${{ secrets.CODESCRIBE_API_KEY }}
        run: |
          for file in $(find . -name "*.py"); do
            echo "Analyzing $file..."
            curl -s -X POST "https://api.documint.ai/api/v1/analyze" \
              -H "X-API-Key: $CODESCRIBE_API_KEY" \
              -H "Content-Type: application/json" \
              -d "{\"code\": $(cat "$file" | jq -Rs .), \"language\": \"python\"}" \
              | jq -r '.suggestions[] | "[" + .severity + "] " + .message'
          done
```

---

## ⚡ Rate Limits

| Tier | Limit |
|------|-------|
| Free | 5 requests/minute |
| Pro | 60 requests/minute |
| Enterprise | Unlimited |

---

## 🔒 Security Notes

1. **Never commit API keys** to version control
2. Use environment variables or secret managers
3. Rotate keys periodically via the dashboard
4. API keys can be revoked instantly if compromised

---

## 📞 Support

- Email: support@documint.ai
- Documentation: https://docs.documint.ai
- Status: https://status.documint.ai

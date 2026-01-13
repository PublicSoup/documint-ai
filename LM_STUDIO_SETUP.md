# Setting Up DocuMint with Qwen 2.5 Coder AI

DocuMint uses a local LLM running via **LM Studio** to generate high-quality code documentation for free.

## 📦 What You Need

- **LM Studio**: Local AI model server with OpenAI-compatible API
- **Qwen 2.5 Coder 7B**: Recommended model for code analysis and documentation (downloading now)

## 🚀 Quick Start Guide

### 1. Launch LM Studio

Once the download completes:

```bash
~/apps/LM_Studio.AppImage
```

Or launch from your applications menu.

### 2. Load the Qwen Model

1. In LM Studio, click the **"AI Chat"** icon (chat bubble) on the left sidebar
2. At the top of the window, click the model dropdown
3. Select **Qwen 2.5 Coder 7B** (it should appear under "Downloaded Models")
4. Wait for the model to load into memory (you'll see a progress indicator)

### 3. Start the Local Server

1. Click the **"Developer / Local Server"** icon (double arrows `<->`) on the left sidebar
2. Configure the server settings:
   - **Port**: `1234` (default - must match DocuMint configuration)
   - **CORS**: `✓ Enabled` (required for web requests)
   - **Auto-start server**: Optional but recommended
3. Click **"Start Server"**
4. Look for the green status indicator showing "Server Running"

### 4. Find Your Model Name

DocuMint will auto-detect the model, but you can verify it's working:

```bash
curl http://localhost:1234/v1/models
```

You should see JSON output with your loaded model. The `"id"` field shows the exact model name.

Example response:
```json
{
  "data": [
    {
      "id": "qwen2.5-coder-7b-instruct-q5_k_m",
      "object": "model",
      ...
    }
  ]
}
```

### 5. Verify DocuMint Connection

Your DocuMint app is configured to connect to `http://localhost:1234/v1`.

Quick connection test:
```bash
# From the project root
cd api
python -c "
import asyncio
import aiohttp

async def test():
    async with aiohttp.ClientSession() as session:
        async with session.get('http://localhost:1234/v1/models') as resp:
            data = await resp.json()
            print(f'✅ Connected! Model: {data[\"data\"][0][\"id\"]}')

asyncio.run(test())
"
```

## 🎯 You're Ready!

Once the server shows **green status** in LM Studio:
1. Start the DocuMint backend: `cd api && uvicorn app.main:app --reload`
2. Start the frontend: `npm run dev`  
3. Upload code and watch Qwen 2.5 Coder generate beautiful documentation!

## 🔧 Troubleshooting

**Server won't start?**
- Ensure port 1234 isn't already in use: `lsof -i :1234`
- Try a different port and update `LM_STUDIO_URL` in environment variables

**Model not loading?**
- Check RAM usage - Qwen 2.5 Coder 7B Q5_K_M needs ~6GB RAM
- Close other memory-intensive applications

**Connection errors in DocuMint?**
- Verify LM Studio server is running (green indicator)
- Check CORS is enabled in LM Studio settings
- Confirm firewall isn't blocking localhost connections

## ⚡ Performance Tips

- **Q5_K_M quantization**: Best balance of quality and speed (recommended)
- **Expected response time**: 5-15 seconds for medium code files
- **GPU acceleration**: If available, enable in LM Studio settings for faster inference


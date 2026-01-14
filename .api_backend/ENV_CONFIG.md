# LM Studio Configuration for DocuMint AI Backend

Copy this file to `.env` in the `/api` directory and update values as needed.

## LM Studio Settings

```bash
# The URL where LM Studio is running
LM_STUDIO_URL=http://localhost:1234

# Model name - set to 'auto' for automatic detection from LM Studio
# Or specify exact model name (e.g., "qwen2.5-coder-7b-instruct")  
LM_STUDIO_MODEL_NAME=auto
```

## Database Configuration

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/documint
```

## Authentication

```bash
# Generate with: openssl rand -hex 32
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

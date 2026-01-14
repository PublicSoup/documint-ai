from fastapi import APIRouter, HTTPException, status, Request
from app.models import AnalyzeRequest, AnalyzeResponse
from app.services.ai_service import AIService
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
# We need to use the limiter instance from app state, but for simplicity in this router 
# we can instantiate a local one or better yet, depend on the one in main.
# However, to avoid circular imports, we'll instantiate one here with same backend.
limiter = Limiter(key_func=get_remote_address)

@router.post("/analyze", response_model=AnalyzeResponse, status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def analyze_code(request: Request, body: AnalyzeRequest):
    """
    Submit code for AI analysis.
    Returns summary, complexity score, and improvement suggestions.
    Rate Limit: 5 requests per minute.
    """
    try:
        if not body.code.strip():
            raise HTTPException(status_code=400, detail="Code cannot be empty")
            
        result = await AIService.analyze_code(body)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

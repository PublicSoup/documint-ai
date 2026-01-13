"""
API Key Management Endpoints
Allows users to generate API keys for external integrations (CLI, CI/CD, etc.)
"""
from fastapi import APIRouter, HTTPException, status, Depends
from sqlmodel import Session, select
from app.models import User, APIKeyResponse
from app.api.deps import get_current_user
from app.db.session import engine
from datetime import datetime
import secrets

router = APIRouter()

def generate_api_key() -> str:
    """Generate a secure API key with prefix for easy identification"""
    return f"csk_{secrets.token_urlsafe(32)}"

@router.post("/generate", response_model=APIKeyResponse)
async def generate_api_key_endpoint(current_user: User = Depends(get_current_user)):
    """
    Generate a new API key for the current user.
    WARNING: The key is only shown once. Store it securely!
    """
    # Generate new API key
    new_key = generate_api_key()
    
    with Session(engine) as session:
        # Get fresh user from DB
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Update user with new API key (we store the full key - in production, hash it!)
        db_user.api_key = new_key
        db_user.api_key_created_at = datetime.utcnow()
        
        session.add(db_user)
        session.commit()
    
    return APIKeyResponse(
        api_key=new_key,
        created_at=db_user.api_key_created_at,
        message="Save this key securely. It will not be shown again."
    )

@router.delete("/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(current_user: User = Depends(get_current_user)):
    """
    Revoke (delete) the current user's API key.
    """
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        db_user.api_key = None
        db_user.api_key_created_at = None
        
        session.add(db_user)
        session.commit()
    
    return None

@router.get("/status")
async def api_key_status(current_user: User = Depends(get_current_user)):
    """
    Check if the current user has an active API key.
    """
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        
    return {
        "has_api_key": db_user.api_key is not None,
        "created_at": db_user.api_key_created_at if db_user.api_key else None
    }

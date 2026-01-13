from sqlmodel import SQLModel, Field
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID, uuid4
from datetime import datetime
import secrets

# ============================================================
# USER MODELS (Authentication)
# ============================================================

class User(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: EmailStr = Field(unique=True, index=True)
    hashed_password: str
    role: str = Field(default="free")  # free, pro, enterprise
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # API Key for external integrations
    api_key: Optional[str] = Field(default=None, index=True)
    api_key_created_at: Optional[datetime] = Field(default=None)
    # Stripe Integration
    stripe_customer_id: Optional[str] = Field(default=None, index=True)
    stripe_subscription_id: Optional[str] = Field(default=None, index=True)
    subscription_status: Optional[str] = Field(default=None) # active, canceled, past_due

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime
    has_api_key: bool = False

    class Config:
        from_attributes = True

# ============================================================
# API KEY MODELS
# ============================================================

class APIKeyCreate(BaseModel):
    """Request to generate a new API key"""
    pass

class APIKeyResponse(BaseModel):
    """Response containing the API key (only shown once!)"""
    api_key: str
    created_at: datetime
    message: str = "Save this key securely. It will not be shown again."

# ============================================================
# ANALYSIS MODELS
# ============================================================

class AnalyzeRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50000)
    language: str = Field(default="python")
    context: Optional[str] = Field(default="")

class CodeSuggestion(BaseModel):
    line_number: Optional[int] = None
    severity: str = Field(default="info")  # info, warning, critical
    message: str
    suggestion: str

class AnalyzeResponse(BaseModel):
    summary: str
    complexity_score: int = Field(ge=1, le=10)
    suggestions: List[CodeSuggestion] = []
    refactored_code: Optional[str] = None

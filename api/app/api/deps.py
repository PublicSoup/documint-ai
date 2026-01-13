"""
Dependency Injection for FastAPI endpoints
"""
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlmodel import Session, select
from typing import Optional

from app.models import User
from app.core.config import settings
from app.db.session import engine

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Validate JWT token and return the current user.
    Used for web UI authentication.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    with Session(engine) as session:
        statement = select(User).where(User.email == email)
        user = session.exec(statement).first()

    if user is None:
        raise credentials_exception

    return user


async def get_current_user_from_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key")
) -> Optional[User]:
    """
    Authenticate via API Key header (for external integrations).
    Returns None if no API key provided (allows fallback to JWT).
    """
    if not x_api_key:
        return None
    
    # Validate API key format
    if not x_api_key.startswith("csk_"):
        return None
    
    with Session(engine) as session:
        statement = select(User).where(User.api_key == x_api_key)
        user = session.exec(statement).first()
    
    return user


async def get_current_user_flexible(
    token: Optional[str] = Depends(oauth2_scheme),
    api_key_user: Optional[User] = Depends(get_current_user_from_api_key)
) -> User:
    """
    Flexible authentication that accepts either:
    1. JWT Bearer Token (from web UI)
    2. X-API-Key header (from external integrations)
    
    Prioritizes API Key if both are provided.
    """
    # Try API key first
    if api_key_user:
        return api_key_user
    
    # Fall back to JWT
    if token:
        try:
            return await get_current_user(token)
        except HTTPException:
            pass
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide either Bearer token or X-API-Key header.",
        headers={"WWW-Authenticate": "Bearer"},
    )

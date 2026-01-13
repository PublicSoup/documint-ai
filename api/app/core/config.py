import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "DocuMint"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "SUPER_SECRET_CHANGE_ME_IN_PRODUCTION")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Stripe
    STRIPE_API_KEY: str = os.getenv("STRIPE_API_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    
    # Prices (You'll need to create these in Stripe Dashboard)
    STRIPE_PRICE_ID_PRO: str = os.getenv("STRIPE_PRICE_ID_PRO", "price_pro_placeholder")
    STRIPE_PRICE_ID_ENTERPRISE: str = os.getenv("STRIPE_PRICE_ID_ENTERPRISE", "price_enterprise_placeholder")
    
    # Frontend URL
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    class Config:
        case_sensitive = True

settings = Settings()

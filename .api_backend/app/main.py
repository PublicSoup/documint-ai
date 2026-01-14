from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import analyze, auth, apikeys, billing
from app.db.session import create_db_and_tables
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Initialize Rate Limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="DocuMint API",
    description="AI-powered code documentation and analysis. Use Bearer token (web) or X-API-Key header (integrations).", 
    version="1.0.0"
)

# Register Rate Limit Exception Handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration
origins = [
    "http://localhost:5173",  # Development
    "http://127.0.0.1:5173",
    "https://habbitarc.pro",  # Production
    "https://www.habbitarc.pro",
    "https://api.habbitarc.pro",
    "*",  # Allow all origins for easier deployment (tighten in production)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# Register Routers
app.include_router(analyze.router, prefix="/api/v1", tags=["Analysis"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(apikeys.router, prefix="/api/v1/apikeys", tags=["API Keys"])
app.include_router(billing.router, prefix="/api/v1/billing", tags=["Billing"])

@app.get("/")
def read_root():
    return {
        "message": "Welcome to DocuMint API", 
        "docs": "/docs",
        "redoc": "/redoc"
    }

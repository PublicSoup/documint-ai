from fastapi import APIRouter, Depends, HTTPException, Request, Header
from app.models import User
from app.api.deps import get_current_user
from app.services.stripe_service import StripeService
from app.core.config import settings
from sqlmodel import Session, select
from app.db.session import engine
import stripe

router = APIRouter()

@router.post("/create-checkout-session")
async def create_checkout(tier: str, current_user: User = Depends(get_current_user)):
    """Create a Stripe checkout session for Pro or Enterprise tiers"""
    price_id = None
    if tier == "pro":
        price_id = settings.STRIPE_PRICE_ID_PRO
    elif tier == "enterprise":
        price_id = settings.STRIPE_PRICE_ID_ENTERPRISE
    else:
        raise HTTPException(status_code=400, detail="Invalid tier")

    if not price_id or "placeholder" in price_id:
        raise HTTPException(
            status_code=400, 
            detail="Stripe Price ID not configured. Please add it to your environment variables."
        )

    session = await StripeService.create_checkout_session(current_user, price_id)
    return {"url": session.url}

@router.post("/customer-portal")
async def customer_portal(current_user: User = Depends(get_current_user)):
    """Generate a link to the Stripe Customer Portal"""
    try:
        session = await StripeService.create_portal_session(current_user)
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """Webhook listener for Stripe events"""
    payload = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook Error: {str(e)}")

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session['metadata'].get('user_id')
        customer_id = session.get('customer')
        subscription_id = session.get('subscription')

        if user_id:
            with Session(engine) as db_session:
                statement = select(User).where(User.id == user_id)
                user = db_session.exec(statement).first()
                if user:
                    user.stripe_customer_id = customer_id
                    user.stripe_subscription_id = subscription_id
                    user.subscription_status = "active"
                    # Determine role based on price_id or just set to pro
                    user.role = "pro" 
                    db_session.add(user)
                    db_session.commit()

    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        customer_id = subscription.get('customer')
        
        with Session(engine) as db_session:
            statement = select(User).where(User.stripe_customer_id == customer_id)
            user = db_session.exec(statement).first()
            if user:
                user.role = "free"
                user.subscription_status = "canceled"
                db_session.add(user)
                db_session.commit()

    return {"status": "success"}

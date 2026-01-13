import stripe
from app.core.config import settings
from app.models import User
from sqlmodel import Session
from app.db.session import engine

stripe.api_key = settings.STRIPE_API_KEY

class StripeService:
    @staticmethod
    async def create_checkout_session(user: User, price_id: str):
        """Create a Stripe Checkout Session for a user"""
        try:
            # Create or get customer
            if not user.stripe_customer_id:
                customer = stripe.Customer.create(
                    email=user.email,
                    metadata={"user_id": str(user.id)}
                )
                user.stripe_customer_id = customer.id
                # Update user in DB
                with Session(engine) as session:
                    session.add(user)
                    session.commit()
                    session.refresh(user)

            session = stripe.checkout.Session.create(
                customer=user.stripe_customer_id,
                payment_method_types=['card'],
                line_items=[{
                    'price': price_id,
                    'quantity': 1,
                }],
                mode='subscription',
                success_url=f"{settings.FRONTEND_URL}/app?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{settings.FRONTEND_URL}/app",
                metadata={"user_id": str(user.id)}
            )
            return session
        except Exception as e:
            print(f"Stripe Error: {e}")
            raise e

    @staticmethod
    async def create_portal_session(user: User):
        """Create a Stripe Customer Portal session for managing subscriptions"""
        if not user.stripe_customer_id:
            raise Exception("User has no Stripe customer ID")
            
        session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/app"
        )
        return session

    @staticmethod
    def handle_webhook(payload, sig_header):
        """Handle Stripe webhooks to update user subscription status"""
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            return "Invalid payload", 400
        except stripe.error.SignatureVerificationError:
            return "Invalid signature", 400

        # Handle specifically the subscription events
        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']
            user_id = session['metadata']['user_id']
            # Update user in DB (omitted for brevity, will implement in endpoints)
            pass
            
        return "Success", 200

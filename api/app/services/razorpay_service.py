from app.models.razorpay_order import RazorpayOrder
from app.config import settings
from app.database.mongodb import db
from datetime import datetime
import razorpay
import hmac
import hashlib

class RazorpayService:
    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

    @staticmethod
    async def create_order(user_id: str, plan: str, period: int, amount: int, currency: str, receipt: str, coupon_code: str = None):
        order_data = {
            "amount": amount,
            "currency": currency,
            "receipt": receipt,
            "payment_capture": 1
        }
        order = RazorpayService.client.order.create(order_data)
        now = datetime.now().isoformat()
        order_doc = RazorpayOrder(
            order_id=order["id"],
            user_id=user_id,
            plan=plan,
            period=period,
            amount=order["amount"],
            currency=order["currency"],
            status=order["status"],
            receipt=order["receipt"],
            coupon_code=coupon_code,
            created_at=now,
            updated_at=now
        )
        await db["razorpay_orders"].insert_one(order_doc.model_dump())
        return order_doc

    @staticmethod
    async def verify_payment(order_id: str, payment_id: str, signature: str):
        order = await db["razorpay_orders"].find_one({"order_id": order_id})
        if not order:
            return False, "Order not found", None
        generated_signature = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode(),
            f"{order_id}|{payment_id}".encode(),
            hashlib.sha256
        ).hexdigest()
        if generated_signature != signature:
            return False, "Invalid signature", None
        await db["razorpay_orders"].update_one(
            {"order_id": order_id},
            {"$set": {"status": "paid", "payment_id": payment_id, "signature": signature, "updated_at": datetime.now().isoformat()}}
        )
        # Return tuple of (plan, period, coupon_code) so subscription can be updated with all data
        return True, {"plan": order["plan"], "period": order.get("period", 1)}, order.get("coupon_code")

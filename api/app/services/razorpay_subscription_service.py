"""
Razorpay Subscription Service
Handles recurring/automatic billing for subscriptions
"""

import asyncio
import functools
import razorpay
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
import logging

from app.config.settings import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, APP_NAME, APP_URL
from app.database.mongodb import db
from app.utils.email_service import send_renewal_reminder_email

logger = logging.getLogger(__name__)

# Initialize Razorpay client
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


class RazorpaySubscriptionService:
    """Service for managing Razorpay subscriptions (recurring payments)"""

    @staticmethod
    async def create_recurring_subscription(
        owner_id: str,
        plan_name: str,
        period_months: int,
        price_paise: int,
        customer_id: str,
        customer_email: str,
        customer_name: str,
        payment_method_id: Optional[str] = None
    ) -> Dict:
        """
        Create a Razorpay subscription for recurring billing
        
        Args:
            owner_id: User ID
            plan_name: Plan name (pro, premium)
            period_months: Billing period in months
            price_paise: Price in paise
            customer_id: Razorpay customer ID
            customer_email: Customer email
            customer_name: Customer name
            payment_method_id: Optional saved payment method ID
            
        Returns:
            Dict with subscription details from Razorpay
        """
        try:
            # Calculate interval and period count
            if period_months == 1:
                interval = 'monthly'
                period_count = 1
            elif period_months == 3:
                interval = 'monthly'
                period_count = 3
            elif period_months == 12:
                interval = 'yearly'
                period_count = 1
            else:
                interval = 'monthly'
                period_count = period_months
            
            subscription_data = {
                'plan_id': f'{plan_name}_{period_months}m',
                'customer_id': customer_id,
                'quantity': 1,
                'total_count': 0,  # 0 means infinite renewals
                'interval': interval,
                'period': period_count,
                'description': f'{plan_name.title()} Plan - Auto Renewal',
                'notes': {
                    'owner_id': owner_id,
                    'plan': plan_name,
                    'period': str(period_months)
                }
            }
            
            # If payment method is available, associate it
            if payment_method_id:
                subscription_data['token'] = payment_method_id
            
            # Create Razorpay subscription
            loop = asyncio.get_event_loop()
            subscription = await loop.run_in_executor(
                None, functools.partial(razorpay_client.subscription.create, subscription_data)
            )
            
            logger.info(f"✓ Razorpay subscription created: {subscription['id']} for user {owner_id}")
            return subscription
            
        except Exception as e:
            logger.error(f"✗ Failed to create Razorpay subscription: {str(e)}")
            raise

    @staticmethod
    async def cancel_recurring_subscription(razorpay_subscription_id: str) -> Dict:
        """
        Cancel a Razorpay subscription
        
        Args:
            razorpay_subscription_id: Razorpay subscription ID
            
        Returns:
            Dict with cancellation details
        """
        try:
            loop = asyncio.get_event_loop()
            subscription = await loop.run_in_executor(
                None, functools.partial(razorpay_client.subscription.cancel, razorpay_subscription_id)
            )
            logger.info(f"✓ Razorpay subscription cancelled: {razorpay_subscription_id}")
            return subscription
            
        except Exception as e:
            logger.error(f"✗ Failed to cancel Razorpay subscription: {str(e)}")
            raise

    @staticmethod
    async def pause_recurring_subscription(razorpay_subscription_id: str, pause_months: int = 1) -> Dict:
        """
        Pause a Razorpay subscription temporarily
        
        Args:
            razorpay_subscription_id: Razorpay subscription ID
            pause_months: Number of months to pause
            
        Returns:
            Dict with pause details
        """
        try:
            loop = asyncio.get_event_loop()
            subscription = await loop.run_in_executor(
                None, functools.partial(
                    razorpay_client.subscription.pause,
                    razorpay_subscription_id,
                    {'pause_at': 'now', 'resume_after': pause_months}
                )
            )
            logger.info(f"✓ Razorpay subscription paused: {razorpay_subscription_id}")
            return subscription
            
        except Exception as e:
            logger.error(f"✗ Failed to pause Razorpay subscription: {str(e)}")
            raise

    @staticmethod
    async def get_subscription_status(razorpay_subscription_id: str) -> Dict:
        """
        Get current status of a Razorpay subscription
        
        Args:
            razorpay_subscription_id: Razorpay subscription ID
            
        Returns:
            Dict with subscription status
        """
        try:
            loop = asyncio.get_event_loop()
            subscription = await loop.run_in_executor(
                None, functools.partial(razorpay_client.subscription.fetch, razorpay_subscription_id)
            )
            return subscription
            
        except Exception as e:
            logger.error(f"✗ Failed to fetch Razorpay subscription status: {str(e)}")
            raise

    @staticmethod
    async def create_payment_link(owner_email: str, owner_name: str, order_id: str, amount: int, plan_name: str, expiry_date: str) -> Optional[str]:
        """
        Create a Razorpay payment link for subscription renewal
        
        Args:
            owner_email: Customer email
            owner_name: Customer name
            order_id: Razorpay order ID
            amount: Amount in paise
            plan_name: Plan name for description
            expiry_date: Subscription expiry date
            
        Returns:
            Payment link URL if created successfully, None otherwise
        """
        try:
            amount_rupees = amount / 100
                link_payload = {
                    'amount': amount,
                    'currency': 'INR',
                    'description': f'{plan_name.title()} Plan Renewal - Expires {expiry_date}',
                    'customer': {
                        'email': owner_email,
                        'name': owner_name
                    },
                    'notify': {
                        'sms': True,
                        'email': True
                    },
                    'reminder_enable': True,
                    'notes': {
                        'order_id': order_id,
                        'plan': plan_name,
                        'renewal': 'true'
                    },
                    'callback_url': f'{APP_URL}/subscription/verify?order_id={order_id}',
                    'callback_method': 'get'
                }
                loop = asyncio.get_event_loop()
                payment_link = await loop.run_in_executor(
                    None, functools.partial(razorpay_client.payment_link.create, link_payload)
                )
            
            logger.info(f"✓ Payment link created: {payment_link.get('short_url')}")
            return payment_link.get('short_url') or payment_link.get('long_url')
            
        except Exception as e:
            logger.error(f"✗ Failed to create payment link: {str(e)}")
            return None

    @staticmethod
    async def check_and_renew_subscriptions() -> Dict:
        """
        Check for subscriptions expiring within 7 days and attempt renewal
        This is called by a scheduled job
        
        Creates payment links and sends email notifications to users.
        
        Returns:
            Dict with renewal statistics
        """
        stats = {
            'checked': 0,
            'renewed': 0,
            'notified': 0,
            'failed': 0,
            'errors': []
        }
        
        try:
            # Find all active subscriptions expiring within 7 days
            now = datetime.now(timezone.utc)
            renewal_window_start = now.isoformat()
            renewal_window_end = (now + timedelta(days=7)).isoformat()
            
            expiring_subs = await db.subscriptions.find({
                'status': 'active',
                'autoRenewal': True,
                'plan': {'$ne': 'free'},  # Don't renew free plan
                'currentPeriodEnd': {
                    '$gte': renewal_window_start,
                    '$lte': renewal_window_end
                }
            }).to_list(None)
            
            stats['checked'] = len(expiring_subs)
            
            for sub in expiring_subs:
                try:
                    # Get user info
                    user = await db.users.find_one({'_id': sub['ownerId']})
                    if not user:
                        stats['failed'] += 1
                        stats['errors'].append(f"User {sub['ownerId']} not found")
                        continue
                    
                    owner_email = user.get('email')
                    owner_name = user.get('name', user.get('email', 'Customer'))
                    
                    if not owner_email:
                        stats['failed'] += 1
                        stats['errors'].append(f"User {sub['ownerId']} missing email")
                        continue
                    
                    # Create renewal order via Razorpay API
                    plan = await db.plans.find_one({'name': sub['plan']})
                    if not plan:
                        stats['failed'] += 1
                        stats['errors'].append(f"Plan {sub['plan']} not found")
                        continue
                    
                    period_str = str(sub['period'])
                    price = plan['periods'].get(period_str, 0)
                    
                    if price == 0:
                        stats['failed'] += 1
                        stats['errors'].append(f"Invalid price for {sub['plan']} {period_str}m")
                        continue
                    
                    # Check for existing pending renewal order to avoid duplicates
                    existing_renewal = await db.renewal_orders.find_one({
                        'subscriptionId': sub['_id'],
                        'status': 'pending'
                    })
                    if existing_renewal:
                        logger.info(f"Skipping renewal for subscription {sub['_id']} - pending order already exists")
                        continue
                    
                    # Create renewal order
                    renewal_order_data = {
                        'amount': price,
                        'currency': 'INR',
                        'receipt': f"renew_{str(sub['ownerId'])[:10]}_{datetime.now(timezone.utc).strftime('%Y%m%d')}",
                        'notes': {
                            'owner_id': str(sub['ownerId']),
                            'plan': sub['plan'],
                            'period': str(sub['period']),
                            'renewal': 'true',
                            'subscription_id': str(sub['_id'])
                        }
                    }
                    loop = asyncio.get_event_loop()
                    order = await loop.run_in_executor(
                        None, functools.partial(razorpay_client.order.create, renewal_order_data)
                    )
                    
                    # Create payment link
                    expiry_date = sub['currentPeriodEnd'][:10] if sub.get('currentPeriodEnd') else 'N/A'
                    payment_link_url = await RazorpaySubscriptionService.create_payment_link(
                        owner_email=owner_email,
                        owner_name=owner_name,
                        order_id=order['id'],
                        amount=price,
                        plan_name=sub['plan'],
                        expiry_date=expiry_date
                    )
                    
                    # Store renewal order for payment verification
                    await db.renewal_orders.insert_one({
                        'ownerId': str(sub['ownerId']),
                        'subscriptionId': sub['_id'],
                        'orderId': order['id'],
                        'plan': sub['plan'],
                        'period': sub['period'],
                        'amount': price,
                        'paymentLinkUrl': payment_link_url,
                        'createdAt': datetime.now(timezone.utc).isoformat(),
                        'status': 'pending',
                        'notifiedAt': datetime.now(timezone.utc).isoformat() if payment_link_url else None
                    })
                    
                    stats['renewed'] += 1
                    
                    # Send email notification with payment link
                    if payment_link_url:
                        amount_str = f"₹{price / 100:,.0f}"
                        email_sent = await send_renewal_reminder_email(
                            email=owner_email,
                            name=owner_name,
                            plan_name=sub['plan'],
                            amount_str=amount_str,
                            expiry_date=expiry_date,
                            payment_link=payment_link_url,
                            app_name=APP_NAME or "Hostel Manager"
                        )
                        
                        if email_sent:
                            stats['notified'] += 1
                            logger.info(f"✓ Renewal notification sent to {owner_email} for order {order['id']}")
                        else:
                            logger.warning(f"✗ Failed to send renewal email to {owner_email}")
                    else:
                        logger.warning(f"✗ No payment link created for order {order['id']}")
                    
                    logger.info(f"✓ Auto-renewal order created for user {sub['ownerId']}: order {order['id']}")
                    
                except Exception as e:
                    stats['failed'] += 1
                    error_msg = str(e)
                    stats['errors'].append(error_msg)
                    logger.error(f"✗ Renewal failed for subscription {sub.get('_id')}: {error_msg}")
                    
                    # Update subscription with error
                    await db.subscriptions.update_one(
                        {'_id': sub['_id']},
                        {
                            '$set': {
                                'renewalError': error_msg,
                                'updatedAt': datetime.now(timezone.utc).isoformat()
                            }
                        }
                    )
            
            logger.info(f"Auto-renewal job completed: {stats['renewed']}/{stats['checked']} renewed, {stats['notified']} notified, {stats['failed']} failed")
            return stats
            
        except Exception as e:
            logger.error(f"✗ Auto-renewal job failed: {str(e)}")
            stats['errors'].append(str(e))
            return stats

    @staticmethod
    async def handle_subscription_payment_success(order_id: str, payment_id: str) -> bool:
        """
        Handle successful renewal payment
        
        Args:
            order_id: Razorpay order ID
            payment_id: Razorpay payment ID
            
        Returns:
            True if renewal was successful
        """
        try:
            # Find renewal order
            renewal = await db.renewal_orders.find_one({'orderId': order_id})
            if not renewal:
                logger.warning(f"Renewal order not found: {order_id}")
                return False
            
            # Update renewal order status
            await db.renewal_orders.update_one(
                {'_id': renewal['_id']},
                {
                    '$set': {
                        'paymentId': payment_id,
                        'status': 'completed',
                        'completedAt': datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            # Extend the subscription
            sub = await db.subscriptions.find_one({'_id': renewal['subscriptionId']})
            if sub:
                # Calculate new period end
                # If current period end is in the past (late renewal), start from now
                # If current period end is in the future (early renewal), extend it
                current_end = datetime.fromisoformat(sub['currentPeriodEnd'])
                now = datetime.now(timezone.utc)
                
                base_date = max(current_end, now)
                new_end = base_date + timedelta(days=renewal['period'] * 30)
                
                await db.subscriptions.update_one(
                    {'_id': sub['_id']},
                    {
                        '$set': {
                            'currentPeriodStart': base_date.isoformat(),
                            'currentPeriodEnd': new_end.isoformat(),
                            'renewalError': None,
                            'updatedAt': datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
                logger.info(f"✓ Subscription extended for user {renewal['ownerId']} until {new_end.isoformat()}")
            
            logger.info(f"✓ Auto-renewal payment successful: {order_id}")
            return True
            
        except Exception as e:
            logger.error(f"✗ Failed to handle renewal payment: {str(e)}")
            return False

    @staticmethod
    async def handle_subscription_payment_failed(order_id: str, error_msg: str) -> bool:
        """
        Handle failed renewal payment
        
        Args:
            order_id: Razorpay order ID
            error_msg: Error message
            
        Returns:
            True if handled successfully
        """
        try:
            # Find renewal order
            renewal = await db.renewal_orders.find_one({'orderId': order_id})
            if not renewal:
                logger.warning(f"Renewal order not found: {order_id}")
                return False
            
            # Update renewal order status
            await db.renewal_orders.update_one(
                {'_id': renewal['_id']},
                {
                    '$set': {
                        'status': 'failed',
                        'error': error_msg,
                        'failedAt': datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            # Update subscription with error
            await db.subscriptions.update_one(
                {'ownerId': renewal['ownerId']},
                {
                    '$set': {
                        'renewalError': f'Payment failed: {error_msg}',
                        'updatedAt': datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            logger.warning(f"✗ Auto-renewal payment failed for order {order_id}: {error_msg}")
            return True
            
        except Exception as e:
            logger.error(f"✗ Failed to handle renewal payment failure: {str(e)}")
            return False

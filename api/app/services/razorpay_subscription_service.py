"""
Razorpay Subscription Service
Handles recurring/automatic billing for subscriptions
"""

import razorpay
from datetime import datetime, timedelta
from typing import Optional, Dict
import logging

from app.config.settings import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
from app.database.mongodb import db

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
            subscription = razorpay_client.subscription.create(subscription_data)
            
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
            subscription = razorpay_client.subscription.cancel(razorpay_subscription_id)
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
            subscription = razorpay_client.subscription.pause(
                razorpay_subscription_id,
                {'pause_at': 'now', 'resume_after': pause_months}
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
            subscription = razorpay_client.subscription.fetch(razorpay_subscription_id)
            return subscription
            
        except Exception as e:
            logger.error(f"✗ Failed to fetch Razorpay subscription status: {str(e)}")
            raise

    @staticmethod
    async def check_and_renew_subscriptions() -> Dict:
        """
        Check for subscriptions expiring within 7 days and attempt renewal
        This is called by a scheduled job
        
        Returns:
            Dict with renewal statistics
        """
        stats = {
            'checked': 0,
            'renewed': 0,
            'failed': 0,
            'errors': []
        }
        
        try:
            # Find all active subscriptions expiring within 7 days
            now = datetime.now()
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
                    # Get user and payment method info
                    user = await db.users.find_one({'_id': sub['ownerId']})
                    if not user or not user.get('razorpayCustomerId'):
                        stats['failed'] += 1
                        stats['errors'].append(f"User {sub['ownerId']} missing Razorpay customer ID")
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
                    
                    # Create renewal via Razorpay subscription or order
                    # For now, we'll create an order and track it
                    order = razorpay_client.order.create({
                        'amount': price,
                        'currency': 'INR',
                        'customer_id': user['razorpayCustomerId'],
                        'description': f'Auto-renewal: {sub["plan"].title()} ({sub["period"]} months)',
                        'notes': {
                            'owner_id': sub['ownerId'],
                            'plan': sub['plan'],
                            'period': sub['period'],
                            'renewal': 'true'
                        }
                    })
                    
                    # Update subscription with new order
                    new_period_start = datetime.fromisoformat(sub['currentPeriodEnd'])
                    new_period_end = new_period_start + timedelta(days=sub['period'] * 30)
                    
                    await db.subscriptions.update_one(
                        {'_id': sub['_id']},
                        {
                            '$set': {
                                'currentPeriodStart': new_period_start.isoformat(),
                                'currentPeriodEnd': new_period_end.isoformat(),
                                'renewalError': None,
                                'updatedAt': datetime.now().isoformat()
                            }
                        }
                    )
                    
                    # Store renewal order for payment verification
                    await db.renewal_orders.insert_one({
                        'ownerId': sub['ownerId'],
                        'orderId': order['id'],
                        'plan': sub['plan'],
                        'period': sub['period'],
                        'amount': price,
                        'createdAt': datetime.now().isoformat(),
                        'status': 'pending'
                    })
                    
                    stats['renewed'] += 1
                    logger.info(f"✓ Auto-renewal initiated for user {sub['ownerId']}: order {order['id']}")
                    
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
                                'updatedAt': datetime.now().isoformat()
                            }
                        }
                    )
            
            logger.info(f"Auto-renewal job completed: {stats['renewed']}/{stats['checked']} renewed, {stats['failed']} failed")
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
                        'completedAt': datetime.now().isoformat()
                    }
                }
            )
            
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
                        'failedAt': datetime.now().isoformat()
                    }
                }
            )
            
            # Update subscription with error
            await db.subscriptions.update_one(
                {'ownerId': renewal['ownerId']},
                {
                    '$set': {
                        'renewalError': f'Payment failed: {error_msg}',
                        'updatedAt': datetime.now().isoformat()
                    }
                }
            )
            
            logger.warning(f"✗ Auto-renewal payment failed for order {order_id}: {error_msg}")
            return True
            
        except Exception as e:
            logger.error(f"✗ Failed to handle renewal payment failure: {str(e)}")
            return False

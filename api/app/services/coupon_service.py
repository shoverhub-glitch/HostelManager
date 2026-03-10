from datetime import datetime
from typing import Optional, Tuple
from app.models.coupon_schema import Coupon, CouponValidationResponse
from app.database.mongodb import db
import logging

logger = logging.getLogger(__name__)

class CouponService:
    
    @staticmethod
    async def create_coupon(code: str, discount_type: str, discount_value: int, description: str = None,
                           max_usage: int = None, expires_at: str = None, min_amount: int = 0,
                           applicable_plans: list = None) -> Coupon:
        """Create a new coupon"""
        try:
            # Check if coupon code already exists
            existing = await db["coupons"].find_one({"code": code.upper()})
            if existing:
                raise ValueError(f"Coupon code '{code}' already exists")
            
            # Validate discount value
            if discount_type == 'percentage' and (discount_value < 0 or discount_value > 100):
                raise ValueError("Percentage discount must be between 0 and 100")
            if discount_type == 'fixed' and discount_value <= 0:
                raise ValueError("Fixed discount must be greater than 0")
            
            now = datetime.now().isoformat()
            
            coupon = Coupon(
                code=code.upper(),
                discountType=discount_type,
                discountValue=discount_value,
                description=description,
                maxUsageCount=max_usage,
                usageCount=0,
                expiresAt=expires_at,
                minAmount=min_amount,
                applicablePlans=applicable_plans or [],
                isActive=True,
                createdAt=now,
                updatedAt=now
            )
            
            result = await db["coupons"].insert_one(coupon.model_dump())
            logger.info(f"✓ Coupon created: {code}")
            return coupon
            
        except Exception as e:
            logger.error(f"Error creating coupon: {str(e)}")
            raise

    @staticmethod
    async def get_coupon(code: str) -> Optional[Coupon]:
        """Get coupon by code"""
        try:
            doc = await db["coupons"].find_one({"code": code.upper()})
            if doc:
                return Coupon(**doc)
            return None
        except Exception as e:
            logger.error(f"Error retrieving coupon: {str(e)}")
            return None

    @staticmethod
    async def validate_coupon(code: str, amount: int, plan: str = None) -> Tuple[bool, str, Optional[int], Optional[int]]:
        """
        Validate coupon and calculate discount
        
        Returns: (is_valid, message, original_amount, final_amount)
        """
        try:
            coupon = await CouponService.get_coupon(code)
            
            if not coupon:
                return False, "Coupon not found", amount, amount
            
            if not coupon.isActive:
                return False, "Coupon is inactive", amount, amount
            
            # Check expiration
            if coupon.expiresAt:
                if datetime.fromisoformat(coupon.expiresAt) < datetime.now():
                    return False, "Coupon has expired", amount, amount
            
            # Check usage limit
            if coupon.maxUsageCount and coupon.usageCount >= coupon.maxUsageCount:
                return False, "Coupon usage limit reached", amount, amount
            
            # Check minimum amount
            if amount < coupon.minAmount:
                return False, f"Minimum order amount {coupon.minAmount} paise required", amount, amount
            
            # Check applicable plans
            if coupon.applicablePlans and plan:
                if plan not in coupon.applicablePlans:
                    return False, f"Coupon not applicable for {plan} plan", amount, amount
            
            # Calculate discount
            if coupon.discountType == 'percentage':
                discount = int(amount * coupon.discountValue / 100)
            else:  # fixed
                discount = min(coupon.discountValue, amount)  # Can't discount more than amount
            
            final_amount = amount - discount
            
            return True, "Coupon applied successfully", amount, final_amount
            
        except Exception as e:
            logger.error(f"Error validating coupon: {str(e)}")
            return False, f"Error validating coupon: {str(e)}", amount, amount

    @staticmethod
    async def apply_coupon(code: str, amount: int, plan: str = None) -> CouponValidationResponse:
        """
        Apply coupon and return validation response with discount calculation
        """
        is_valid, message, original, final = await CouponService.validate_coupon(code, amount, plan)
        
        if not is_valid:
            return CouponValidationResponse(
                isValid=False,
                message=message,
                originalAmount=amount,
                discountAmount=0,
                finalAmount=amount,
                discountPercentage=None
            )
        
        coupon = await CouponService.get_coupon(code)
        discount = original - final
        discount_percentage = int(discount * 100 / original) if original > 0 else 0
        
        return CouponValidationResponse(
            isValid=True,
            message=message,
            originalAmount=original,
            discountAmount=discount,
            finalAmount=final,
            discountPercentage=discount_percentage if coupon.discountType == 'percentage' else None
        )

    @staticmethod
    async def increment_usage(code: str) -> bool:
        """Increment coupon usage count after successful payment"""
        try:
            result = await db["coupons"].update_one(
                {"code": code.upper()},
                {"$inc": {"usageCount": 1}, "$set": {"updatedAt": datetime.now().isoformat()}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error incrementing coupon usage: {str(e)}")
            return False

    @staticmethod
    async def update_coupon(code: str, **kwargs) -> Optional[Coupon]:
        """Update coupon fields"""
        try:
            # Don't allow code changes
            if 'code' in kwargs:
                del kwargs['code']
            
            kwargs['updatedAt'] = datetime.now().isoformat()
            
            result = await db["coupons"].find_one_and_update(
                {"code": code.upper()},
                {"$set": kwargs},
                return_document=True
            )
            
            if result:
                return Coupon(**result)
            return None
        except Exception as e:
            logger.error(f"Error updating coupon: {str(e)}")
            return None

    @staticmethod
    async def delete_coupon(code: str) -> bool:
        """Delete coupon"""
        try:
            result = await db["coupons"].delete_one({"code": code.upper()})
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Error deleting coupon: {str(e)}")
            return False

    @staticmethod
    async def list_coupons(is_active: bool = None) -> list:
        """List all coupons with optional filtering"""
        try:
            query = {}
            if is_active is not None:
                query['isActive'] = is_active
            
            coupons = await db["coupons"].find(query).to_list(length=None)
            return [Coupon(**doc) for doc in coupons]
        except Exception as e:
            logger.error(f"Error listing coupons: {str(e)}")
            return []

    @staticmethod
    async def get_coupon_stats(code: str) -> Optional[dict]:
        """Get coupon usage statistics"""
        try:
            coupon = await CouponService.get_coupon(code)
            if not coupon:
                return None
            
            usage_percentage = 0
            if coupon.maxUsageCount:
                usage_percentage = int(coupon.usageCount * 100 / coupon.maxUsageCount)
            
            return {
                'code': coupon.code,
                'discountType': coupon.discountType,
                'discountValue': coupon.discountValue,
                'totalUsage': coupon.usageCount,
                'maxUsage': coupon.maxUsageCount,
                'usagePercentage': usage_percentage if coupon.maxUsageCount else None,
                'isActive': coupon.isActive,
                'expiresAt': coupon.expiresAt,
                'createdAt': coupon.createdAt
            }
        except Exception as e:
            logger.error(f"Error getting coupon stats: {str(e)}")
            return None

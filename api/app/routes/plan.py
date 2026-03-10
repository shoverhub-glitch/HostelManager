"""
Plan Management Routes (Admin Only)
Allows admin to create, update, and manage subscription plans.
All property owners will use these centrally managed plans.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.models.plan_schema import Plan, PlanCreate, PlanUpdate
from app.services.plan_service import PlanService
from app.utils.helpers import get_current_user


router = APIRouter(prefix="/admin/plans", tags=["Admin - Plans"])


# TODO: Add admin role check middleware
# For now, all authenticated users can access these routes
# In production, add: dependencies=[Depends(require_admin_role)]


@router.post("", response_model=Plan, status_code=status.HTTP_201_CREATED)
async def create_plan(
    plan_data: PlanCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new subscription plan (Admin only)
    
    - Validates plan name uniqueness
    - Validates periods and pricing
    - Stores in database for all property owners to use
    
    Example:
    ```json
    {
      "name": "starter",
      "display_name": "Starter Plan",
      "description": "For small property owners",
      "properties": 2,
      "tenants": 10,
      "rooms": 10,
      "staff": 3,
      "periods": {
        "1": 4900,
        "3": 12000,
        "6": 20000
      },
      "is_active": true,
      "sort_order": 1
    }
    ```
    """
    try:
        plan = await PlanService.create_plan(plan_data)
        return plan
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create plan: {str(e)}"
        )


@router.get("", response_model=List[Plan])
async def list_plans(
    active_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    List all subscription plans (Admin view)
    
    Query Parameters:
    - active_only: If true, return only active plans
    
    Returns list of all plans sorted by sort_order
    """
    try:
        plans = await PlanService.get_all_plans(active_only=active_only)
        return plans
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plans: {str(e)}"
        )


@router.get("/stats")
async def get_plan_stats(
    current_user: dict = Depends(get_current_user)
):
    """
    Get statistics about plans and their usage (Admin only)
    
    Returns:
    - Total plans
    - Active/inactive counts
    - Usage by plan (active subscriptions per plan)
    """
    try:
        stats = await PlanService.get_plan_stats()
        return stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch stats: {str(e)}"
        )


@router.get("/{plan_name}", response_model=Plan)
async def get_plan(
    plan_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a specific plan by name (Admin view)
    
    Returns complete plan details including all periods and pricing
    """
    plan = await PlanService.get_plan_by_name(plan_name)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan '{plan_name}' not found"
        )
    return plan


@router.patch("/{plan_name}", response_model=Plan)
async def update_plan(
    plan_name: str,
    update_data: PlanUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update an existing plan (Admin only)
    
    - Can update pricing, limits, description, etc.
    - Cannot change plan name (create new plan instead)
    - Updates reflected immediately for all users
    
    Example - Update pricing:
    ```json
    {
      "periods": {
        "1": 8900,
        "3": 22000,
        "6": 38000,
        "12": 65000
      }
    }
    ```
    """
    try:
        updated_plan = await PlanService.update_plan(plan_name, update_data)
        if not updated_plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan '{plan_name}' not found"
            )
        return updated_plan
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update plan: {str(e)}"
        )


@router.delete("/{plan_name}")
async def delete_plan(
    plan_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a plan (Admin only)
    
    CAUTION: Cannot delete plans with active subscriptions
    Consider deactivating instead
    """
    try:
        deleted = await PlanService.delete_plan(plan_name)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan '{plan_name}' not found"
            )
        return {"success": True, "message": f"Plan '{plan_name}' deleted successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete plan: {str(e)}"
        )


@router.post("/{plan_name}/activate", response_model=Plan)
async def activate_plan(
    plan_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Activate a plan (Admin only)
    
    Makes the plan available for selection by property owners
    """
    plan = await PlanService.activate_plan(plan_name)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan '{plan_name}' not found"
        )
    return plan


@router.post("/{plan_name}/deactivate", response_model=Plan)
async def deactivate_plan(
    plan_name: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Deactivate a plan (Admin only)
    
    Prevents new subscriptions but doesn't affect existing users
    Cannot deactivate the 'free' plan
    """
    try:
        plan = await PlanService.deactivate_plan(plan_name)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan '{plan_name}' not found"
            )
        return plan
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/initialize")
async def initialize_default_plans(
    current_user: dict = Depends(get_current_user)
):
    """
    Initialize default plans (Admin only)
    
    Creates free, pro, and premium plans if plans collection is empty
    Safe to call multiple times - only creates if none exist
    """
    try:
        created_count = await PlanService.create_default_plans()
        return {
            "success": True,
            "message": f"Created {created_count} default plans" if created_count > 0 else "Plans already exist",
            "plans_created": created_count
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize plans: {str(e)}"
        )

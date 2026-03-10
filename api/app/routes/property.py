from fastapi import APIRouter, status, Request, HTTPException
from app.models.property_schema import PropertyCreate, PropertyOut, PropertyUpdate
from app.services.property_service import PropertyService
from app.services.subscription_enforcement import SubscriptionEnforcement


router = APIRouter(prefix="/properties", tags=["properties"])
property_service = PropertyService()

@router.post("", status_code=status.HTTP_201_CREATED, response_model=PropertyOut)
async def create_property(request: Request, property: PropertyCreate):
    try:
        user_id = getattr(request.state, "user_id", None)
        
        # Check subscription quota before creating property
        await SubscriptionEnforcement.ensure_can_create_property(user_id)
        
        return await property_service.create_property(property.model_dump(exclude_unset=True), user_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error creating property. Please try again.")

@router.get("")
async def get_properties(
    request: Request,
    page: int = 1,
    page_size: int = 50
):
    """Get properties with pagination support"""
    try:
        # Validate and normalize pagination params
        page = max(1, page)
        page_size = min(100, max(1, page_size))  # Cap at 100 per page
        skip = (page - 1) * page_size
        
        user_id = getattr(request.state, "user_id", None)
        properties, total = await property_service._list_properties_paginated(user_id, skip=skip, limit=page_size)
        
        return {
            "data": [prop.model_dump() for prop in properties],
            "meta": {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "hasMore": skip + page_size < total
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error retrieving properties. Please try again.")

@router.patch("/{property_id}")
async def update_property(request: Request, property_id: str, property_update: PropertyUpdate):
    try:
        user_id = getattr(request.state, "user_id", None)
        
        # Check if property is archived
        await SubscriptionEnforcement.ensure_property_not_archived(property_id)
        
        # Update property
        updated = await property_service.update_property(property_id, user_id, property_update.model_dump(exclude_unset=True))
        if not updated:
            raise HTTPException(status_code=404, detail="Property not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error updating property. Please try again.")

@router.delete("/{property_id}")
async def delete_property(request: Request, property_id: str):
    try:
        user_id = getattr(request.state, "user_id", None)
        
        # Check if property is archived
        await SubscriptionEnforcement.ensure_property_not_archived(property_id)
        
        # Delete property
        result = await property_service.delete_property(property_id, user_id)
        if not result.get("success"):
            raise HTTPException(status_code=404, detail="Property not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error deleting property. Please try again.")

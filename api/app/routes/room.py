from fastapi import APIRouter, Depends, HTTPException, status, Request
from app.services.room_service import RoomService
from app.services.subscription_enforcement import SubscriptionEnforcement
from app.models.room_schema import Room
from app.database.mongodb import db

router = APIRouter(prefix="/rooms", tags=["rooms"])
room_service = RoomService()

@router.get("")
@router.get("/")
async def get_rooms(request: Request, property_id: str = None, search: str = None, page: int = 1, page_size: int = 50):
    property_ids = getattr(request.state, "property_ids", [])
    query = {"propertyId": {"$in": property_ids}}
    if property_id:
        query["propertyId"] = property_id
    if search:
        query["$or"] = [
            {"roomNumber": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    page = max(1, page)
    page_size = min(100, max(1, page_size))  # Cap at 100 per page
    skip = (page - 1) * page_size
    
    total = await room_service.collection.count_documents(query)
    rooms = await room_service.collection.find(query).skip(skip).limit(page_size).to_list(length=page_size)
    
    for doc in rooms:
        doc["id"] = str(doc["_id"])
        if "_id" in doc:
            del doc["_id"]
    
    return {
        "data": rooms,
        "meta": {
            "total": total,
            "page": page,
            "pageSize": page_size,
            "hasMore": skip + page_size < total
        }
    }

@router.get("/{room_id}")
async def get_room(request: Request, room_id: str):
    room = await room_service.get_room(room_id)
    property_ids = getattr(request.state, "property_ids", [])
    if room and room.propertyId in property_ids:
        return {"data": room.model_dump()}
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

@router.get("/{room_id}/preview-bed-change")
async def preview_bed_count_change(request: Request, room_id: str, new_bed_count: int):
    """Preview what will happen if bed count is changed"""
    room = await room_service.get_room(room_id)
    property_ids = getattr(request.state, "property_ids", [])
    if room and room.propertyId in property_ids:
        result = await room_service.preview_bed_count_change(room_id, new_bed_count)
        return {"data": result}
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

@router.post("")
@router.post("/")
async def create_room(request: Request, room: Room):
    try:
        user_id = getattr(request.state, "user_id", None)
        property_ids = getattr(request.state, "property_ids", [])
        if room.propertyId not in property_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Property not accessible by user.")
        
        # Check subscription quota before creating room (30 rooms per property)
        await SubscriptionEnforcement.ensure_can_create_room(user_id, room.propertyId)
        
        created = await room_service.create_room(room.model_dump())
        return {"data": created.model_dump()}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error creating room. Please try again.")

@router.patch("/{room_id}")
async def patch_room(request: Request, room_id: str, room: Room):
    try:
        orig = await room_service.get_room(room_id)
        property_ids = getattr(request.state, "property_ids", [])
        if orig and orig.propertyId in property_ids:
            # Check if room is archived
            await SubscriptionEnforcement.ensure_room_not_archived(room_id)
            
            updated = await room_service.update_room(room_id, room.model_dump())
            return {"data": updated.model_dump()} if updated else {"data": {}}
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error updating room. Please try again.")

@router.delete("/{room_id}")
async def delete_room(request: Request, room_id: str):
    try:
        orig = await room_service.get_room(room_id)
        property_ids = getattr(request.state, "property_ids", [])
        if orig and orig.propertyId in property_ids:
            # Check if room is archived
            await SubscriptionEnforcement.ensure_room_not_archived(room_id)
            
            result = await room_service.delete_room(room_id)
            return result
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error deleting room. Please try again.")

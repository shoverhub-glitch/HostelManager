from pydantic import BaseModel
from typing import Optional

class Room(BaseModel):
    id: Optional[str] = None
    propertyId: str
    roomNumber: str
    floor: str
    price: int
    numberOfBeds: int
    active: bool = True
    archivedReason: Optional[str] = None
    archivedAt: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

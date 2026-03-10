from pydantic import BaseModel, Field
from typing import Optional

class PropertyBase(BaseModel):
    ownerIds: list[str] = Field(default_factory=list, description="Owner IDs")
    ownerId: Optional[str] = Field(default=None, description="Primary owner ID (legacy compatibility)")
    name: str = Field(..., description="Property name")
    address: str = Field(..., description="Property address")
    active: bool = Field(default=True, description="Is property active (not archived)")
    archivedReason: Optional[str] = Field(None, description="Why property was archived during downgrade")
    archivedAt: Optional[str] = Field(None, description="When property was archived ISO string")
    createdAt: Optional[str] = Field(None, description="Created at ISO string")
    updatedAt: Optional[str] = Field(None, description="Updated at ISO string")

class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    active: Optional[bool] = None
    archivedReason: Optional[str] = None
    archivedAt: Optional[str] = None

class PropertyOut(PropertyBase):
    id: str
    active: bool = True
    archivedReason: Optional[str] = None
    archivedAt: Optional[str] = None



from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal, Union
from datetime import datetime, date
from enum import Enum

class PaymentStatus(str, Enum):
    PAID = 'paid'
    DUE = 'due'

class PaymentMethod(str, Enum):
    CASH = 'Cash'
    ONLINE = 'Online'
    BANK_TRANSFER = 'Bank Transfer'
    UPI = 'UPI'
    CHEQUE = 'Cheque'

class PaymentBase(BaseModel):
    tenantId: str
    propertyId: str
    bed: str
    amount: str
    status: Literal['paid', 'due']
    dueDate: Optional[date] = None
    paidDate: Optional[date] = None
    method: Optional[str] = Field(default=PaymentMethod.CASH.value)

    @field_validator('dueDate', 'paidDate', mode='before')
    @classmethod
    def normalize_date_fields(cls, value):
        if value is None or value == '':
            return None

        if isinstance(value, date) and not isinstance(value, datetime):
            return value

        if isinstance(value, datetime):
            return value.date()

        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return None

            if 'T' in raw:
                try:
                    return datetime.fromisoformat(raw.replace('Z', '+00:00')).date()
                except ValueError:
                    try:
                        return date.fromisoformat(raw[:10])
                    except ValueError:
                        return raw

            try:
                return date.fromisoformat(raw)
            except ValueError:
                try:
                    return datetime.fromisoformat(raw.replace('Z', '+00:00')).date()
                except ValueError:
                    return raw

        return value

class PaymentCreate(PaymentBase):
    pass

class Payment(PaymentBase):
    id: str
    createdAt: datetime
    updatedAt: datetime
    tenantName: Optional[str] = None  # Enriched field from tenant lookup
    roomNumber: Optional[str] = None  # Enriched field from room lookup


class PaymentUpdate(BaseModel):
    """
    Payment update model for PATCH requests.
    All fields are optional - only provided fields will be updated.
    Dates can be provided as date objects or ISO string format.
    """
    tenantId: Optional[str] = None
    propertyId: Optional[str] = None
    bed: Optional[str] = None
    amount: Optional[str] = None
    status: Optional[str] = None
    dueDate: Optional[Union[str, date]] = None  # Can be string (ISO format) or date object
    paidDate: Optional[Union[str, date]] = None  # Can be string (ISO format) or date object
    method: Optional[str] = None
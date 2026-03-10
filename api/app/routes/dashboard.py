from fastapi import APIRouter, Request, HTTPException
from app.database.mongodb import getCollection
from datetime import datetime, timedelta
from bson import ObjectId

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/stats")
async def get_dashboard_stats(request: Request, property_id: str):
    """Get aggregated dashboard statistics for a specific property"""
    property_ids = getattr(request.state, "property_ids", [])
    
    # Validate that the requested property_id belongs to the user
    if property_id not in property_ids:
        raise HTTPException(status_code=403, detail="You don't have access to this property")
    
    # Get collections
    tenants_col = getCollection("tenants")
    beds_col = getCollection("beds")
    payments_col = getCollection("payments")
    staff_col = getCollection("staff")
    
    # Count tenants for this property - separate active and vacated
    # Handle tenants with missing tenantStatus field (treat as 'active' by default)
    active_tenants_count = await tenants_col.count_documents({
        "propertyId": property_id,
        "archived": {"$ne": True},
        "$or": [
            {"tenantStatus": "active"},
            {"tenantStatus": {"$exists": False}}  # Existing tenants without the field default to active
        ]
    })
    vacated_tenants_count = await tenants_col.count_documents({
        "propertyId": property_id,
        "archived": {"$ne": True},
        "tenantStatus": "vacated"
    })
    tenants_count = active_tenants_count  # Count only active tenants
    
    # Count beds and occupancy
    total_beds = await beds_col.count_documents({"propertyId": property_id})
    occupied_beds = await beds_col.count_documents({
        "propertyId": property_id,
        "status": "occupied"
    })
    
    occupancy_rate = (occupied_beds / total_beds * 100) if total_beds > 0 else 0
    
    # Get current month dates
    today = datetime.now()
    month_start = datetime(today.year, today.month, 1).date()
    # Get last day of month
    if today.month == 12:
        month_end = datetime(today.year + 1, 1, 1).date() - timedelta(days=1)
    else:
        month_end = datetime(today.year, today.month + 1, 1).date() - timedelta(days=1)
    
    month_start_str = month_start.isoformat()
    month_end_str = month_end.isoformat()
    
    # Get revenue metrics
    paid_payments = await payments_col.aggregate([
        {
            "$match": {
                "propertyId": property_id,
                "status": "paid",
                "paidDate": {
                    "$gte": month_start_str,
                    "$lte": month_end_str
                }
            }
        },
        {
            "$addFields": {
                "amountNumeric": {
                    "$toInt": {
                        "$replaceAll": {
                            "input": {
                                "$replaceAll": {
                                    "input": "$amount",
                                    "find": "₹",
                                    "replacement": ""
                                }
                            },
                            "find": ",",
                            "replacement": ""
                        }
                    }
                }
            }
        },
        {
            "$group": {
                "_id": None,
                "total": {"$sum": "$amountNumeric"}
            }
        }
    ]).to_list(None)
    
    paid_this_month = paid_payments[0]["total"] if paid_payments else 0
    
    # Get pending payments
    pending_payments = await payments_col.aggregate([
        {
            "$match": {
                "propertyId": property_id,
                "status": "due"
            }
        },
        {
            "$addFields": {
                "amountNumeric": {
                    "$toInt": {
                        "$replaceAll": {
                            "input": {
                                "$replaceAll": {
                                    "input": "$amount",
                                    "find": "₹",
                                    "replacement": ""
                                }
                            },
                            "find": ",",
                            "replacement": ""
                        }
                    }
                }
            }
        },
        {
            "$group": {
                "_id": None,
                "count": {"$sum": 1},
                "amount": {"$sum": "$amountNumeric"}
            }
        }
    ]).to_list(None)
    
    pending_count = pending_payments[0]["count"] if pending_payments else 0
    pending_amount = pending_payments[0]["amount"] if pending_payments else 0
    
    # Get monthly revenue (all paid in current month)
    monthly_revenue = paid_this_month
    
    # Count check-ins today
    today_start = datetime.combine(today.date(), datetime.min.time()).isoformat()
    today_end = datetime.combine(today.date(), datetime.max.time()).isoformat()
    
    check_ins_today = await tenants_col.count_documents({
        "propertyId": property_id,
        "joinDate": {
            "$gte": today_start,
            "$lte": today_end
        }
    })
    
    # Get staff info
    total_staff = await staff_col.count_documents({
        "propertyId": property_id,
        "active": True
    })
    
    available_staff = await staff_col.count_documents({
        "propertyId": property_id,
        "active": True,
        "status": "available"
    })
    
    return {
        "data": {
            "totalTenants": tenants_count,
            "activeTenants": active_tenants_count,
            "vacatedTenants": vacated_tenants_count,
            "totalBeds": total_beds,
            "occupiedBeds": occupied_beds,
            "occupancyRate": round(occupancy_rate, 2),
            "monthlyRevenue": monthly_revenue,
            "monthlyRevenueFormatted": f"₹{monthly_revenue:,.0f}",
            "pendingPayments": pending_count,
            "duePaymentAmountFormatted": f"₹{pending_amount:,.0f}",
            "checkInsToday": check_ins_today,
            "totalStaff": total_staff,
            "availableStaff": available_staff,
        }
    }

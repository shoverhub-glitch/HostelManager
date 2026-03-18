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
    
    # Combined aggregation for all metrics using $facet
    # This reduces DB round-trips from 7 to 1, significantly improving performance at scale.
    
    # Get current month dates
    today = datetime.now()
    month_start_str = datetime(today.year, today.month, 1).date().isoformat()
    # Get last day of month
    if today.month == 12:
        month_end = datetime(today.year + 1, 1, 1).date() - timedelta(days=1)
    else:
        month_end = datetime(today.year, today.month + 1, 1).date() - timedelta(days=1)
    month_end_str = month_end.isoformat()

    # Today's range for check-ins
    today_start = datetime.combine(today.date(), datetime.min.time()).isoformat()
    today_end = datetime.combine(today.date(), datetime.max.time()).isoformat()

    pipeline = [
        {"$facet": {
            "tenants": [
                {"$match": {"propertyId": property_id, "archived": {"$ne": True}, "isDeleted": {"$ne": True}}},
                {"$group": {
                    "_id": None,
                    "active": {"$sum": {"$cond": [{"$ne": ["$tenantStatus", "vacated"]}, 1, 0]}},
                    "vacated": {"$sum": {"$cond": [{"$eq": ["$tenantStatus", "vacated"]}, 1, 0]}},
                    "checkInsToday": {"$sum": {"$cond": [{"$and": [{"$gte": ["$joinDate", today_start]}, {"$lte": ["$joinDate", today_end]}]}, 1, 0]}}
                }}
            ],
            "beds": [
                {"$match": {"propertyId": property_id}},
                {"$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "occupied": {"$sum": {"$cond": [{"$eq": ["$status", "occupied"]}, 1, 0]}}
                }}
            ],
            "revenue": [
                {"$match": {"propertyId": property_id, "isDeleted": {"$ne": True}}},
                {"$addFields": {
                    "amountNumeric": {
                        "$toDouble": {
                            "$replaceAll": {
                                "input": {
                                    "$replaceAll": {
                                        "input": {"$ifNull": ["$amount", "0"]},
                                        "find": "₹",
                                        "replacement": ""
                                    }
                                },
                                "find": ",",
                                "replacement": ""
                            }
                        }
                    }
                }},
                {"$group": {
                    "_id": None,
                    "paidThisMonth": {"$sum": {"$cond": [
                        {"$and": [{"$eq": ["$status", "paid"]}, {"$gte": ["$paidDate", month_start_str]}, {"$lte": ["$paidDate", month_end_str]}]},
                        "$amountNumeric", 0
                    ]}},
                    "pendingCount": {"$sum": {"$cond": [{"$eq": ["$status", "due"]}, 1, 0]}},
                    "pendingAmount": {"$sum": {"$cond": [{"$eq": ["$status", "due"]}, "$amountNumeric", 0]}}
                }}
            ],
            "staff": [
                {"$match": {"propertyId": property_id, "active": True}},
                {"$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "available": {"$sum": {"$cond": [{"$eq": ["$status", "available"]}, 1, 0]}}
                }}
            ]
        }}
    ]

    agg_results = await tenants_col.aggregate(pipeline).to_list(1)
    results = agg_results[0] if agg_results else {}

    # Extract metrics with safe defaults
    t_stats = results.get("tenants", [{}])[0] if results.get("tenants") else {}
    b_stats = results.get("beds", [{}])[0] if results.get("beds") else {}
    r_stats = results.get("revenue", [{}])[0] if results.get("revenue") else {}
    s_stats = results.get("staff", [{}])[0] if results.get("staff") else {}

    active_tenants = t_stats.get("active", 0)
    vacated_tenants = t_stats.get("vacated", 0)
    check_ins_today = t_stats.get("checkInsToday", 0)

    total_beds = b_stats.get("total", 0)
    occupied_beds = b_stats.get("occupied", 0)
    occupancy_rate = (occupied_beds / total_beds * 100) if total_beds > 0 else 0

    monthly_revenue = r_stats.get("paidThisMonth", 0.0)
    pending_count = r_stats.get("pendingCount", 0)
    pending_amount = r_stats.get("pendingAmount", 0.0)

    total_staff = s_stats.get("total", 0)
    available_staff = s_stats.get("available", 0)

    return {
        "data": {
            "totalTenants": active_tenants,
            "activeTenants": active_tenants,
            "vacatedTenants": vacated_tenants,
            "totalBeds": total_beds,
            "occupiedBeds": occupied_beds,
            "occupancyRate": round(occupancy_rate, 2),
            "monthlyRevenue": int(monthly_revenue),
            "monthlyRevenueFormatted": f"₹{monthly_revenue:,.0f}",
            "pendingPayments": pending_count,
            "duePaymentAmountFormatted": f"₹{pending_amount:,.0f}",
            "checkInsToday": check_ins_today,
            "totalStaff": total_staff,
            "availableStaff": available_staff,
        }
    }

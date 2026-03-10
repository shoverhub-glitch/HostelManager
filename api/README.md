# FastAPI + MongoDB Backend

## Structure

- `app/main.py`: FastAPI entrypoint
- `app/models/`: Pydantic models
- `app/routes/`: API routes
- `app/services/`: Business logic
- `app/database/`: MongoDB connection
- `app/utils/`: Utility functions
- `app/config/`: Settings/configuration
- `app/tests/`: Test cases

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```

## Environment

- Configure `.env` for MongoDB and debug settings.
### Subscription Plans Configuration

Subscription plans (properties, tenants, rooms, staff limits and pricing) can be customized via environment variables for production deployments.

**Limit Meanings:**
- `{plan}Properties`: Total number of properties owner can create (per-owner limit)
- `{plan}Tenants`: Max tenants PER property
- `{plan}Rooms`: Max rooms PER property
- `{plan}Staff`: Max staff members PER property

**Example Usage (Pro Plan):**
- Owner can create 3 properties total
- Each property can have max 50 tenants
- Each property can have max 50 rooms (3 properties × 50 = 150 total rooms possible)
- Each property can have max 5 staff members (3 properties × 5 = 15 total staff possible)

**Format:** Simple key=value pairs (e.g., `freeProperties=1`, `proTenants=50`, `premiumPrice=129`)

**Example .env:**
```env
# FREE PLAN
freeProperties=1
freeTenants=20
freeRooms=30
freeStaff=3
freePrice=0

# PRO PLAN
proProperties=3
proTenants=50
proRooms=50
proStaff=5
proPrice=7900

# PREMIUM PLAN
premiumProperties=5
premiumTenants=100
premiumRooms=70
premiumStaff=7
premiumPrice=12900
```

**To change pricing in production:**

For example, to change Pro plan price from ₹79 to ₹129, just update:
```env
proPrice=12900
```

Price text is **generated automatically** from the price value (7900 paise = ₹79, 12900 paise = ₹129, etc.)

**If not set:** System uses default values
```
Free: properties=1, tenants=20 (per property), rooms=30 (per property), staff=3 (per property), price=₹0
Pro: properties=3, tenants=50 (per property), rooms=50 (per property), staff=5 (per property), price=₹79
Premium: properties=5, tenants=100 (per property), rooms=70 (per property), staff=7 (per property), price=₹129
```

**Enforcement Logic:**
- **Properties**: Total count (per-owner limit)
- **Tenants**: Per-property enforcement (e.g., property can't exceed 50 tenants in Pro plan)
- **Rooms**: Per-property enforcement (e.g., property can't exceed 50 rooms in Pro plan)
- **Staff**: Per-property enforcement (e.g., property can't exceed 5 staff members in Pro plan)

**Available Fields per Plan:**
- `{plan}Properties`: Max properties owner can have
- `{plan}Tenants`: Max tenants per property
- `{plan}Rooms`: Max rooms per property
- `{plan}Staff`: Max staff members per property
- `{plan}Price`: Price in paise (e.g., 7900 = ₹79)
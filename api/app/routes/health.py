from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from app.database.mongodb import db
from app.config import settings

router = APIRouter()

@router.get("/health", tags=["health"])
async def health_check():
    try:
        await db.command("ping")
        return {"status": "ok"}
    except Exception:
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={"status": "error"})


@router.get("/health/auth-config", tags=["health"])
async def auth_config_health_check():
    google_client_ids = [client_id.strip() for client_id in settings.GOOGLE_CLIENT_IDS.split(",") if client_id.strip()]
    google_auth_configured = len(google_client_ids) > 0

    return {
        "status": "ok",
        "auth": {
            "google": {
                "configured": google_auth_configured,
                "clientIdsCount": len(google_client_ids),
            }
        },
    }

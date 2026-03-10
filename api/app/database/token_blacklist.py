from .mongodb import db

blacklist_collection = db["token_blacklist"]

from datetime import datetime, timezone

async def blacklist_token(token: str):
    await blacklist_collection.insert_one({
        "token": token,
        "createdAt": datetime.now(timezone.utc)
    })

async def is_token_blacklisted(token: str) -> bool:
    return await blacklist_collection.find_one({"token": token}) is not None

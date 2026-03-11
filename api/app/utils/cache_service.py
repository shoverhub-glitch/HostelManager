import json
import logging
from typing import Optional, Any
import redis.asyncio as redis
from app.config.settings import REDIS_URL

logger = logging.getLogger(__name__)

class RedisCache:
    """Async Redis cache for performance optimization."""
    _client: Optional[redis.Redis] = None

    @classmethod
    async def get_client(cls) -> redis.Redis:
        if cls._client is None:
            cls._client = redis.from_url(REDIS_URL, decode_responses=True)
        return cls._client

    @classmethod
    async def get(cls, key: str) -> Optional[Any]:
        """Fetch from cache and deserialize JSON."""
        try:
            client = await cls.get_client()
            data = await client.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            logger.error(f"Cache GET error: {str(e)}")
            return None

    @classmethod
    async def set(cls, key: str, value: Any, expire_seconds: int = 300) -> bool:
        """Serialize to JSON and store in cache with TTL."""
        try:
            client = await cls.get_client()
            await client.set(key, json.dumps(value), ex=expire_seconds)
            return True
        except Exception as e:
            logger.error(f"Cache SET error: {str(e)}")
            return False

    @classmethod
    async def delete(cls, key: str) -> bool:
        """Remove item from cache."""
        try:
            client = await cls.get_client()
            await client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Cache DELETE error: {str(e)}")
            return False

    @classmethod
    async def invalidate_prefix(cls, prefix: str) -> bool:
        """Invalidate all keys starting with prefix (e.g. 'plans:')"""
        try:
            client = await cls.get_client()
            async for key in client.scan_iter(f"{prefix}*"):
                await client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Cache Prefix Invalidation error: {str(e)}")
            return False

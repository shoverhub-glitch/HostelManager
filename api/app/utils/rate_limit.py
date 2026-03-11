import logging
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config.settings import REDIS_URL, USE_IN_MEMORY_RATE_LIMIT

logger = logging.getLogger(__name__)

# Prefer Redis in production, but allow explicit in-memory mode for local/dev setups.
if USE_IN_MEMORY_RATE_LIMIT:
    logger.warning("Rate limiting is using in-memory storage (USE_IN_MEMORY_RATE_LIMIT=true).")
    limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
else:
    try:
        limiter = Limiter(
            key_func=get_remote_address,
            default_limits=["100/minute"],
            storage_uri=REDIS_URL,
        )
    except Exception as exc:
        logger.warning("Falling back to in-memory rate limiting because Redis is unavailable: %s", exc)
        limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

# Login-specific rate limit (stricter to prevent brute force)
login_rate_limit_dep = limiter.limit("5/minute")

# General route-specific limits
rate_limit_dep = limiter.limit("100/minute")
sensitive_action_limit = limiter.limit("10/minute")

from slowapi import Limiter
from slowapi.util import get_remote_address

# Small-traffic deployments use in-memory storage only.
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# Login-specific rate limit (stricter to prevent brute force)
login_rate_limit_dep = limiter.limit("5/minute")

# General route-specific limits
rate_limit_dep = limiter.limit("100/minute")
sensitive_action_limit = limiter.limit("10/minute")

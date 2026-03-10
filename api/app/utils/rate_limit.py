from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

# General rate limit: 60 requests per minute per IP
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

# Login-specific rate limit
login_rate_limit_dep = limiter.limit("5/minute")
# Use login_rate_limit_dep for login endpoints, rate_limit_dep for others
rate_limit_dep = limiter.limit("60/minute")

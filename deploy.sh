#!/usr/bin/env bash
set -euo pipefail

EMAIL="${EMAIL:-testuser@test.com}"
PASSWORD="${PASSWORD:-testuser123}"
NAME="${NAME:-Test User}"
PHONE="${PHONE:-+919876543210}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-20}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-3}"

log() {
  printf '[deploy] %s\n' "$1"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log "Starting docker compose services"
docker compose up -d --build

for ((attempt=1; attempt<=MAX_ATTEMPTS; attempt++)); do
  log "Seeding test user (attempt ${attempt}/${MAX_ATTEMPTS})"

  if docker compose exec -T backend python - "$EMAIL" "$PASSWORD" "$NAME" "$PHONE" <<'PY'
import asyncio
import sys
from datetime import datetime, timezone

from app.database.mongodb import db, client
from app.services.subscription_service import SubscriptionService
from app.utils.helpers import hash_password


async def seed_user(email: str, password: str, name: str, phone: str) -> None:
    users_collection = db["users"]
    login_attempts_collection = db["login_attempts"]
    otp_attempts_collection = db["otp_attempts"]
    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)

    existing = await users_collection.find_one({"email": normalized_email})

    if existing:
        await users_collection.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "name": name,
                    "email": normalized_email,
                    "phone": phone,
                    "password": hash_password(password),
                    "role": "propertyowner",
                    "isVerified": True,
                    "isEmailVerified": True,
                    "isDeleted": False,
                    "updatedAt": now,
                }
            },
        )
        user_id = str(existing["_id"])
        action = "updated"
    else:
        user_doc = {
            "name": name,
            "email": normalized_email,
            "phone": phone,
            "password": hash_password(password),
            "role": "propertyowner",
            "isVerified": True,
            "isEmailVerified": True,
            "isDeleted": False,
            "lastLogin": None,
            "createdAt": now,
            "updatedAt": now,
            "deviceId": None,
            "deviceType": None,
            "osVersion": None,
            "appVersion": None,
            "propertyIds": [],
            "propertyLimit": 3,
        }
        result = await users_collection.insert_one(user_doc)
        user_id = str(result.inserted_id)
        action = "created"

    await SubscriptionService.create_default_subscriptions(user_id)

    # Ensure seeded user can log in immediately even if prior lockout records exist.
    await login_attempts_collection.delete_one({"email": normalized_email})
    await otp_attempts_collection.delete_one({"email": normalized_email})

    print(f"Test user {action}: {normalized_email} ({user_id})")


async def main() -> int:
    try:
        await seed_user(
            email=sys.argv[1],
            password=sys.argv[2],
            name=sys.argv[3],
            phone=sys.argv[4],
        )
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
PY
  then
    log "Success: test user is ready"
    printf 'Email: %s\n' "$EMAIL"
    printf 'Password: %s\n' "$PASSWORD"
    exit 0
  fi

  if [[ "$attempt" -lt "$MAX_ATTEMPTS" ]]; then
    log "Backend not ready yet. Retrying in ${RETRY_DELAY_SECONDS}s"
    sleep "$RETRY_DELAY_SECONDS"
  fi
done

printf '[deploy] Failed to seed test user after %s attempts\n' "$MAX_ATTEMPTS" >&2
exit 1

#!/usr/bin/env bash
set -euo pipefail

# ── Config (override via environment) ────────────────────────────────────────
EMAIL="${EMAIL:-testuser@test.com}"
PASSWORD="${PASSWORD:-testuser123}"
NAME="${NAME:-Test User}"
PHONE="${PHONE:-+919876543210}"

SEED_ADMIN="${SEED_ADMIN:-true}"
ADMIN_NAME="${ADMIN_NAME:-Platform Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangeMe@123}"
ADMIN_PHONE="${ADMIN_PHONE:-+919876543210}"
ADMIN_GRANT_BY="${ADMIN_GRANT_BY:-email}"
SKIP_ADMIN_ENV_UPDATE="${SKIP_ADMIN_ENV_UPDATE:-true}"

MAX_ATTEMPTS="${MAX_ATTEMPTS:-20}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-3}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { printf '[deploy] %s\n' "$1"; }

is_true() {
  case "${1,,}" in
    true|1|yes|y) return 0 ;;
    *) return 1 ;;
  esac
}

# ── Resolve script directory and cd into it ───────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"


# ── Check for .env in main root ───────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  printf '[deploy] ERROR: .env file not found in project root (%s)\n' "$SCRIPT_DIR" >&2
  exit 1
fi

# ── Pick compose binary (v2 plugin preferred) ────────────────────────────────
if docker compose version &>/dev/null 2>&1; then
  COMPOSE=(docker compose --project-directory "$SCRIPT_DIR")
elif command -v docker-compose &>/dev/null; then
  log "Warning: 'docker compose' plugin not found, falling back to 'docker-compose'"
  COMPOSE=(docker-compose --project-directory "$SCRIPT_DIR")
else
  printf '[deploy] ERROR: neither "docker compose" nor "docker-compose" found\n' >&2
  exit 1
fi

# ── Start services ────────────────────────────────────────────────────────────
log "Starting docker compose services"
"${COMPOSE[@]}" up -d --build

# ── Seed loop ─────────────────────────────────────────────────────────────────
for (( attempt = 1; attempt <= MAX_ATTEMPTS; attempt++ )); do

  log "Seeding test user (attempt ${attempt}/${MAX_ATTEMPTS})"

  # ── Test-user seed ──────────────────────────────────────────────────────────
  if ! "${COMPOSE[@]}" exec -T backend python - "$EMAIL" "$PASSWORD" "$NAME" "$PHONE" <<'PY'
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
            "isEmailVerified": True,
            "isDeleted": False,
            "lastLogin": None,
            "createdAt": now,
            "updatedAt": now,
            "propertyIds": [],
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
    # Backend not ready yet — sleep and retry
    if (( attempt < MAX_ATTEMPTS )); then
      log "Backend not ready yet. Retrying in ${RETRY_DELAY_SECONDS}s"
      sleep "$RETRY_DELAY_SECONDS"
    fi
    continue
  fi

  # Test user succeeded. Now handle admin seed (if enabled).
  # FIX: `admin_ready` must be reset each iteration so a previous failed
  # attempt doesn't carry a stale `false` into the next pass.
  admin_ready=true

  if is_true "$SEED_ADMIN"; then
    log "Seeding admin user (attempt ${attempt}/${MAX_ATTEMPTS})"

    admin_cmd=(
      python create_admin.py
      --name     "$ADMIN_NAME"
      --email    "$ADMIN_EMAIL"
      --password "$ADMIN_PASSWORD"
      --phone    "$ADMIN_PHONE"
      --grant-by "$ADMIN_GRANT_BY"
    )

    if is_true "$SKIP_ADMIN_ENV_UPDATE"; then
      admin_cmd+=(--skip-env-update)
    fi

    if ! "${COMPOSE[@]}" exec -T backend "${admin_cmd[@]}"; then
      admin_ready=false
    fi
  fi

  # FIX: Both branches (admin failed / not seeding admin) now reach this check
  # cleanly, instead of the original where `continue` was inside the wrong `if`
  # block and the success exit was unreachable on admin failure.
  if ! $admin_ready; then
    if (( attempt < MAX_ATTEMPTS )); then
      log "Admin setup failed. Retrying in ${RETRY_DELAY_SECONDS}s"
      sleep "$RETRY_DELAY_SECONDS"
      continue
    fi
    printf '[deploy] ERROR: Failed to seed admin user after %s attempts\n' "$MAX_ATTEMPTS" >&2
    exit 1
  fi

  # ── All done ────────────────────────────────────────────────────────────────
  log "Success: test user is ready"
  printf '  Email:    %s\n' "$EMAIL"
  printf '  Password: %s\n' "$PASSWORD"

  if is_true "$SEED_ADMIN"; then
    log "Success: admin user is ready"
    printf '  Admin Email: %s\n' "$ADMIN_EMAIL"
  fi

  exit 0

done

printf '[deploy] ERROR: Failed to seed test user after %s attempts\n' "$MAX_ATTEMPTS" >&2
exit 1
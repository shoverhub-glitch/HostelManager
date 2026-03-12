#!/bin/bash

# ========================================================================
# HOSTELMANAGER DEPLOYMENT SCRIPT FOR UBUNTU
# ========================================================================
# This script automates the deployment of HostelManager stack to Ubuntu.
# Usage: bash deploy.sh
# Optional overrides:
#   PUBLIC_HOST=api.example.com ALLOWED_ORIGINS=https://app.example.com bash deploy.sh
# ========================================================================

set -euo pipefail

echo "=========================================="
echo "HostelManager Deployment"
echo "=========================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "${EUID}" -eq 0 ]; then
    echo -e "${RED}Run this script as a regular user with sudo access, not as root.${NC}"
    exit 1
fi

detect_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(sudo docker compose)
        COMPOSE_LABEL="sudo docker compose"
        return
    fi

    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(sudo docker-compose)
        COMPOSE_LABEL="sudo docker-compose"
        return
    fi

    echo -e "${RED}Docker Compose not found. Install either docker compose plugin or docker-compose.${NC}"
    exit 1
}

get_public_ip() {
    local token
    token=$(curl -fsS -m 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || true)

    if [ -n "$token" ]; then
        curl -fsS -m 2 -H "X-aws-ec2-metadata-token: $token" "http://169.254.169.254/latest/meta-data/public-ipv4" 2>/dev/null || true
        return
    fi

    curl -fsS -m 2 "http://169.254.169.254/latest/meta-data/public-ipv4" 2>/dev/null || true
}

prompt_with_default() {
    local prompt="$1"
    local default_value="$2"
    local user_value

    if [ ! -t 0 ]; then
        printf '%s' "$default_value"
        return
    fi

    read -r -p "$prompt [$default_value]: " user_value
    if [ -n "$user_value" ]; then
        printf '%s' "$user_value"
        return
    fi

    printf '%s' "$default_value"
}

echo -e "${YELLOW}Step 1: Updating system packages...${NC}"
sudo apt update

echo -e "${YELLOW}Step 2: Verifying required tools...${NC}"
if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}Docker not found. Install it first with: sudo apt install -y docker.io docker-compose-v2${NC}"
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    sudo apt install -y curl
fi

if ! command -v openssl >/dev/null 2>&1; then
    sudo apt install -y openssl
fi

detect_compose_cmd
echo -e "${GREEN}Docker found: $(docker --version)${NC}"
echo -e "${GREEN}Compose command: ${COMPOSE_LABEL}${NC}"

echo -e "${YELLOW}Step 3: Ensuring Docker service is running...${NC}"
sudo systemctl start docker
sudo systemctl enable docker

if ! groups "$USER" | grep -q '\bdocker\b'; then
    sudo usermod -aG docker "$USER"
    echo -e "${YELLOW}Added $USER to docker group. New group membership applies on next login, but sudo is used for this run.${NC}"
fi

echo -e "${YELLOW}Step 4: Preparing production environment file...${NC}"
PRIVATE_IP=$(hostname -I | awk '{print $1}')
DETECTED_PUBLIC_HOST=$(get_public_ip)
DEFAULT_PUBLIC_HOST="${PUBLIC_HOST:-${DETECTED_PUBLIC_HOST:-$PRIVATE_IP}}"
PUBLIC_HOST_VALUE=$(prompt_with_default "Public host or IP" "$DEFAULT_PUBLIC_HOST")
DEFAULT_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8081,http://$PUBLIC_HOST_VALUE"
ALLOWED_ORIGINS_VALUE=$(prompt_with_default "Allowed origins" "${ALLOWED_ORIGINS:-$DEFAULT_ALLOWED_ORIGINS}")

if [ ! -f api/.env ]; then
    JWT_SECRET_VALUE="${JWT_SECRET:-$(openssl rand -hex 32)}"

    cat > api/.env << EOF
# ========================================
# MONGODB & DATABASE
# ========================================
MONGO_URL=mongodb://mongodb:27017/hostelmanager
MONGO_DB_NAME=hostelmanager

# ========================================
# JWT & SECURITY
# ========================================
JWT_SECRET=$JWT_SECRET_VALUE
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_MINUTES=10080

# ========================================
# CORS & SECURITY
# ========================================
ALLOWED_ORIGINS=$ALLOWED_ORIGINS_VALUE
ALLOW_CREDENTIALS=${ALLOW_CREDENTIALS:-false}
ENFORCE_HTTPS=${ENFORCE_HTTPS:-false}

# ========================================
# EMAIL SERVICE (OPTIONAL)
# ========================================
ZEPTO_MAIL_API_KEY=${ZEPTO_MAIL_API_KEY:-}
FROM_EMAIL=${FROM_EMAIL:-noreply@yourdomain.com}

# ========================================
# OAUTH INTEGRATION (OPTIONAL)
# ========================================
GOOGLE_CLIENT_IDS=${GOOGLE_CLIENT_IDS:-}

# ========================================
# PAYMENT PROCESSING (OPTIONAL)
# ========================================
RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID:-}
RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET:-}
RAZORPAY_WEBHOOK_SECRET=${RAZORPAY_WEBHOOK_SECRET:-}

# ========================================
# ENVIRONMENT CONFIG
# ========================================
ENV=production
PUBLIC_PATHS=/api/v1/health,/api/v1/health/auth-config,/api/v1/auth/login,/api/v1/auth/register,/api/v1/auth/google,/api/v1/auth/refresh,/api/v1/auth/forgot-password,/api/v1/auth/reset-password,/api/v1/auth/email/send-otp,/api/v1/auth/email/verify-otp,/api/v1/auth/resend-otp,/api/v1/auth/resend-verification,/api/v1/subscription/webhook
EOF

    echo -e "${GREEN}Created api/.env${NC}"
else
    echo -e "${YELLOW}api/.env already exists. Leaving it unchanged.${NC}"
fi

echo -e "${YELLOW}Step 5: Building and starting Docker services...${NC}"
"${COMPOSE_CMD[@]}" up -d --build

echo -e "${YELLOW}Step 6: Waiting for the API health check to pass...${NC}"
HEALTH_URL="http://localhost/api/v1/health"
HEALTH_OK=0

for attempt in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        HEALTH_OK=1
        break
    fi
    sleep 2
done

echo -e "${YELLOW}Step 7: Verifying running services...${NC}"
"${COMPOSE_CMD[@]}" ps

echo -e "${YELLOW}Step 8: Health check result...${NC}"
if [ "$HEALTH_OK" -eq 1 ]; then
    echo -e "${GREEN}API is responding at $HEALTH_URL${NC}"
else
    echo -e "${RED}API health check did not pass yet. Check container logs:${NC}"
    "${COMPOSE_CMD[@]}" logs --tail=100 backend nginx
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Finished"
echo "==========================================${NC}"
echo ""
echo -e "API endpoints:"
echo -e "  Local health:   ${YELLOW}http://localhost/api/v1/health${NC}"
echo -e "  Public health:  ${YELLOW}http://$PUBLIC_HOST_VALUE/api/v1/health${NC}"
echo ""
echo -e "Services expected:"
echo -e "  MongoDB:  ${GREEN}api-mongodb${NC}"
echo -e "  API:      ${GREEN}fast-api-backend${NC}"
echo -e "  Nginx:    ${GREEN}api-nginx${NC}"
echo ""
echo -e "Useful commands:"
echo -e "  View logs:         ${YELLOW}${COMPOSE_LABEL} logs -f${NC}"
echo -e "  Restart services:  ${YELLOW}${COMPOSE_LABEL} restart${NC}"
echo -e "  Stop services:     ${YELLOW}${COMPOSE_LABEL} down${NC}"
echo -e "  Check status:      ${YELLOW}${COMPOSE_LABEL} ps${NC}"
echo ""
echo -e "If you need real email, Google auth, or Razorpay, edit api/.env and rerun ${COMPOSE_LABEL} up -d.${NC}"

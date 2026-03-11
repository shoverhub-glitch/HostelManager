#!/bin/bash

# ========================================================================
# HOSTELMANAGER DEPLOYMENT SCRIPT FOR UBUNTU
# ========================================================================
# This script automates the deployment of HostelManager stack to Ubuntu
# Usage: bash deploy.sh
# ========================================================================

set -e  # Exit on error

echo "=========================================="
echo "HostelManager Deployment"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as ubuntu user (not root)
if [ "$USER" != "ubuntu" ]; then
    echo -e "${RED}❌ This script should be run as 'ubuntu' user, not root${NC}"
    exit 1
fi

# Step 1: Update system
echo -e "${YELLOW}Step 1: Updating system packages...${NC}"
sudo apt update
sudo apt upgrade -y

# Step 2: Verify Docker is installed
echo -e "${YELLOW}Step 2: Verifying Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker first:${NC}"
    echo "   sudo apt install -y docker.io docker-compose"
    exit 1
fi
echo -e "${GREEN}✓ Docker found: $(docker --version)${NC}"

# Step 3: Add user to docker group (if not already)
if ! groups $USER | grep -q docker; then
    echo -e "${YELLOW}Step 3: Adding ubuntu user to docker group...${NC}"
    sudo usermod -aG docker ubuntu
    echo -e "${GREEN}✓ User added to docker group (you may need to log out and back in)${NC}"
fi

# Step 4: Start Docker service
echo -e "${YELLOW}Step 4: Starting Docker service...${NC}"
sudo systemctl start docker
sudo systemctl enable docker
echo -e "${GREEN}✓ Docker service started${NC}"

# Step 5: Create production .env file
echo -e "${YELLOW}Step 5: Creating production .env file...${NC}"

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

if [ ! -f api/.env ]; then
    cat > api/.env << EOF
# ========================================
# MONGODB & DATABASE
# ========================================
MONGO_URL=mongodb://mongodb:27017/hostelmanager
MONGO_DB_NAME=hostelmanager

# ========================================
# JWT & SECURITY
# ========================================
JWT_SECRET=$(openssl rand -hex 32)
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_MINUTES=43200

# ========================================
# CORS & ALLOWED ORIGINS
# ========================================
ALLOWED_ORIGINS=http://$SERVER_IP,http://$SERVER_IP:8000,https://your-domain.com
ALLOW_CREDENTIALS=false
ENFORCE_HTTPS=false

# ========================================
# EMAIL SERVICE (OPTIONAL)
# ========================================
ZEPTO_MAIL_API_KEY=
FROM_EMAIL=noreply@yourdomain.com

# ========================================
# PAYMENT PROCESSING (OPTIONAL)
# ========================================
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# ========================================
# REDIS & CACHING
# ========================================
REDIS_URL=redis://redis:6379/0
USE_IN_MEMORY_RATE_LIMIT=false

# ========================================
# ENVIRONMENT CONFIG
# ========================================
ENV=production
PUBLIC_PATHS=/api/v1/health,/api/v1/auth/login,/api/v1/auth/register,/api/v1/auth/google
EOF
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${YELLOW}ℹ️  Server IP detected: $SERVER_IP${NC}"
else
    echo -e "${YELLOW}⚠️  .env file already exists, skipping...${NC}"
fi

# Step 6: Build and start services
echo -e "${YELLOW}Step 6: Building and starting Docker services...${NC}"
sudo docker-compose up -d --build

# Step 7: Wait for services to be ready
echo -e "${YELLOW}Step 7: Waiting for services to be ready (30 seconds)...${NC}"
sleep 30

# Step 8: Verify all services are running
echo -e "${YELLOW}Step 8: Verifying all services are running...${NC}"
sudo docker-compose ps

# Step 9: Test API health
echo -e "${YELLOW}Step 9: Testing API health endpoint...${NC}"
if curl -s http://localhost:8000/api/v1/health > /dev/null; then
    echo -e "${GREEN}✓ API is responding${NC}"
else
    echo -e "${RED}⚠️  API health check failed (services may still be starting)${NC}"
fi

# Final message
echo ""
echo -e "${GREEN}=========================================="
echo "✓ Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo -e "API Access Points:"
echo -e "  • Local:  ${YELLOW}http://localhost:8000${NC}"
echo -e "  • Docker Network:  ${YELLOW}http://backend:8000${NC}"
echo -e "  • Public IP: ${YELLOW}http://$SERVER_IP${NC}"
echo ""
echo -e "Services running:"
echo -e "  • MongoDB:  ${GREEN}api-mongodb${NC}"
echo -e "  • Redis:    ${GREEN}api-redis${NC}"
echo -e "  • API:      ${GREEN}fast-api-backend${NC}"
echo -e "  • Nginx:    ${GREEN}api-nginx${NC}"
echo ""
echo -e "Useful commands:"
echo -e "  View logs:         ${YELLOW}sudo docker-compose logs -f${NC}"
echo -e "  Restart services:  ${YELLOW}sudo docker-compose restart${NC}"
echo -e "  Stop services:     ${YELLOW}sudo docker-compose down${NC}"
echo -e "  Check status:      ${YELLOW}sudo docker-compose ps${NC}"
echo ""

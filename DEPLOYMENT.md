# Deployment Guide for AWS EC2

This project can be deployed with plain Docker Compose. No deployment script is required.

## Prerequisites
- Ubuntu server with Docker installed
- Docker Compose available as either `docker compose` or `docker-compose`
- Security group allowing at least:
  - Port 22 for SSH
  - Port 80 for HTTP

## Deploy

### 1. Clone the repository
```bash
cd /home/ubuntu
git clone git@github.com:shoverhub-glitch/HostelManager.git
cd HostelManager
```

### 2. Create the backend env file
```bash
cp api/.env.example api/.env
nano api/.env
```

At minimum, update these values in `api/.env`:
- `JWT_SECRET`: generate with `openssl rand -hex 32`
- `ALLOWED_ORIGINS`: replace `YOUR_SERVER_PUBLIC_IP` with your EC2 public IP or domain
- `ZEPTO_MAIL_API_KEY`, `FROM_EMAIL`, `GOOGLE_CLIENT_IDS`, `RAZORPAY_*`: set real values only if you use those features

Defaults already work for Docker Compose:
- `MONGO_URL=mongodb://mongodb:27017/hostelmanager`

### 3. Start the stack
```bash
sudo docker compose up -d --build
```

### 4. Check the stack
```bash
sudo docker compose ps
sudo docker compose logs -f
curl http://localhost/api/v1/health
```

If Nginx is running correctly, the public endpoint is:
```text
http://YOUR_SERVER_PUBLIC_IP/api/v1/health
```

## Daily Commands

Start:
```bash
sudo docker compose up -d
```

Stop:
```bash
sudo docker compose down
```

Rebuild after code changes:
```bash
sudo docker compose up -d --build
```

Logs:
```bash
sudo docker compose logs -f backend
sudo docker compose logs -f nginx
sudo docker compose logs -f mongodb
```

## Troubleshooting

### API not reachable from browser
- Confirm EC2 security group allows inbound traffic on port 80
- Run `sudo docker compose ps`
- Run `curl http://localhost/api/v1/health` on the server

### Nginx returns 502
- Backend is still starting or has crashed
- Check `sudo docker compose logs -f backend`

### MongoDB uses too much memory
- On a small EC2 instance, local MongoDB may be heavy
- If needed, switch `MONGO_URL` in `api/.env` to MongoDB Atlas and restart Compose

## Services

| Service | Port | Purpose |
|---------|------|---------|
| MongoDB | 27017 | Database |
| Backend | 8000 | FastAPI app |
| Nginx | 80 | Reverse proxy |

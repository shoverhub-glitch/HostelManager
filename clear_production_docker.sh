#!/bin/bash

set -e

# Confirmation prompt
read -p "This will clear all production containers, images, and volumes. Do you want to continue? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
	echo "Aborted. No changes made."
	exit 1
fi

# Stop and remove all containers, networks, and volumes for production compose
docker compose -f docker-compose.yml down --volumes --remove-orphans

# Remove all images used by the compose file
docker compose -f docker-compose.yml rm -fsv
docker compose -f docker-compose.yml images -q | xargs -r docker rmi -f

# Remove named volumes (from docker and local disk)

# Remove named volumes only if they exist
vols=$(docker volume ls -q --filter 'name=hostelmanager_mongodb_data' --filter 'name=hostelmanager_mongodb_config')
if [ -n "$vols" ]; then
	docker volume rm $vols
fi

# Remove local backup/log folders if needed
rm -rf mongodb_backups api_logs

echo "Production Docker Compose, images, and volumes have been cleared."

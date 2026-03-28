#!/bin/bash

# Development Docker Compose runner
# Usage: ./run-dev.sh [start|stop|logs|restart]

COMMAND=$1

case "$COMMAND" in
  start|"")
    echo "Starting development environment..."
    docker compose -f docker-compose.dev.yml up -d
    echo ""
    echo "Services started:"
    echo "  - MongoDB:     localhost:27017"
    echo "  - Backend API: http://localhost:8000"
    echo "  - Admin UI:    http://localhost:5173"
    echo "  - Mobile UI:   http://localhost:8081"
    ;;
  stop)
    echo "Stopping development environment..."
    docker compose -f docker-compose.dev.yml down
    ;;
  logs)
    docker compose -f docker-compose.dev.yml logs -f
    ;;
  restart)
    echo "Restarting development environment..."
    docker compose -f docker-compose.dev.yml restart
    ;;
  clean)
    echo "Cleaning up containers and volumes..."
    docker compose -f docker-compose.dev.yml down -v
    ;;
  *)
    echo "Usage: ./run-dev.sh [start|stop|logs|restart|clean]"
    ;;
esac

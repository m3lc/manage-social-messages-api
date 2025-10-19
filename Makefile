# Makefile for Social Messages API
# Makes common Docker commands easier to remember

.PHONY: help build up down restart logs shell db-shell migrate test clean

# Default target
help:
	@echo "Social Messages API - Available Commands"
	@echo "========================================="
	@echo ""
	@echo "Quick Start:"
	@echo "  make up              - Start all services"
	@echo "  make logs            - View logs"
	@echo "  make down            - Stop all services"
	@echo ""
	@echo "Development:"
	@echo "  make dev             - Start in development mode (hot reload)"
	@echo "  make shell           - Open shell in app container"
	@echo "  make db-shell        - Open PostgreSQL shell"
	@echo ""
	@echo "Database:"
	@echo "  make migrate         - Run database migrations"
	@echo "  make migrate-undo    - Undo last migration"
	@echo "  make db-backup       - Backup database to backup.sql"
	@echo "  make db-restore      - Restore database from backup.sql"
	@echo ""
	@echo "Testing:"
	@echo "  make test            - Run all tests"
	@echo "  make test-unit       - Run unit tests"
	@echo "  make test-int        - Run integration tests"
	@echo ""
	@echo "Maintenance:"
	@echo "  make build           - Rebuild containers"
	@echo "  make restart         - Restart all services"
	@echo "  make clean           - Remove all containers and volumes"
	@echo "  make rebuild         - Clean build from scratch"
	@echo ""

# Quick commands
up:
	docker-compose up -d
	@echo "✅ Services started!"
	@echo "API: http://localhost:3000"
	@echo "Run 'make logs' to view logs"

down:
	docker-compose down
	@echo "✅ Services stopped"

restart:
	docker-compose restart
	@echo "✅ Services restarted"

# Development
dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

build:
	docker-compose build
	@echo "✅ Build complete"

rebuild: clean
	docker-compose build --no-cache
	docker-compose up -d
	@echo "✅ Complete rebuild done"

# Logs
logs:
	docker-compose logs -f

logs-app:
	docker-compose logs -f app

logs-db:
	docker-compose logs -f db

# Shell access
shell:
	docker-compose exec app sh

db-shell:
	docker-compose exec db psql -U social_messages -d social_messages

# Database operations
migrate:
	docker-compose exec app npm run db:migrate
	@echo "✅ Migrations complete"

migrate-undo:
	docker-compose exec app npm run db:migrate:undo
	@echo "✅ Migration rolled back"

db-backup:
	docker-compose exec db pg_dump -U social_messages social_messages > backup.sql
	@echo "✅ Database backed up to backup.sql"

db-restore:
	docker-compose exec -T db psql -U social_messages social_messages < backup.sql
	@echo "✅ Database restored from backup.sql"

db-reset:
	docker-compose down -v
	docker-compose up -d db
	@echo "Waiting for database to start..."
	@sleep 10
	docker-compose up -d app
	@echo "✅ Database reset complete"

# Testing
test:
	docker-compose exec app npm test

test-unit:
	docker-compose exec app npm run test:unit

test-int:
	docker-compose exec app npm run test:integration

# Maintenance
clean:
	docker-compose down -v
	@echo "✅ All containers and volumes removed"

prune:
	docker system prune -a
	@echo "✅ Docker system pruned"

# Health check
status:
	@docker-compose ps
	@echo ""
	@echo "Health Check:"
	@curl -s http://localhost:3000/v1/status || echo "❌ API not responding"

health:
	@curl -s http://localhost:3000/v1/status/health | jq '.' || echo "❌ Health check failed"

# Installation
install:
	cp .env.docker .env
	@echo "✅ Environment file created"
	@echo "⚠️  Edit .env and set SOCIAL_MEDIA_API_KEY and JWT_SECRET"
	@echo "Then run: make up"

# Complete setup (first time)
setup: install up migrate
	@echo ""
	@echo "✅ Setup complete!"
	@echo "API running at http://localhost:3000"
	@echo ""
	@echo "Next steps:"
	@echo "1. Get a token: curl -X POST http://localhost:3000/v1/users/login -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\"}'"
	@echo "2. View logs: make logs"
	@echo "3. Stop: make down"

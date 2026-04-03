.PHONY: dev dev-admin dev-docs openapi \
       build build-api build-admin build-docs \
       up down logs ps \
       lint format check \
       migrate \
       clean token help

# ─── Development ────────────────────────────────────

dev: ## Start API dev server (port 3000)
	cargo run -p lohikeitto

dev-admin: ## Start admin backend + frontend (port 3002)
	cargo run -p admin & ADMIN_PID=$$!; \
	while ! curl -s http://localhost:1337/health > /dev/null 2>&1; do sleep 0.5; done; \
	pnpm --prefix admin run dev --port 3002 & wait $$ADMIN_PID

dev-docs: openapi ## Start docs dev server (port 3333)
	pnpm --prefix docs run dev --port 3333

openapi: ## Regenerate docs/public/openapi.json from Rust source
	cargo run -p lohikeitto -- --openapi > docs/public/openapi.json
	@echo "OpenAPI spec written to docs/public/openapi.json"

# ─── Build ──────────────────────────────────────────

build: ## Build all crates (release)
	cargo build --release

build-api: ## Build API only (release)
	cargo build --release -p lohikeitto

build-admin: ## Build admin only (release)
	cargo build --release -p admin

build-docs: ## Build documentation site
	pnpm --prefix docs run build

# ─── Docker ─────────────────────────────────────────

up: ## Start services with Docker Compose
	docker compose up -d

down: ## Stop all services
	docker compose down

logs: ## Follow Docker Compose logs
	docker compose logs -f

ps: ## Show running containers
	docker compose ps

# ─── Code Quality ───────────────────────────────────

lint: ## Run all linters (biome + clippy)
	cd ./docs && pnpm biome check .
	cd ./admin && pnpm biome check .
	cargo clippy --workspace -- -D warnings

format: ## Format all code (biome + cargo fmt)
	cd ./docs && pnpm biome check --fix --unsafe .
	cd ./docs && pnpm biome format --write .
	cd ./admin && pnpm biome check --fix --unsafe .
	cd ./admin && pnpm biome format --write .
	cargo fmt --all

check: ## Run all checks (lint + cargo check + clippy)
	cd ./docs && pnpm biome check .
	cd ./admin && pnpm biome check .
	cargo check --workspace
	cargo clippy --workspace -- -D warnings

# ─── Database ───────────────────────────────────────

migrate: ## Run SQLx database migrations
	cargo sqlx migrate run

restore: ## Restore latest dump from ./dumps (skips if DB already has data)
	@./scripts/restore-latest-dump.sh

restore-force: ## Restore latest dump, replacing existing data
	@./scripts/restore-latest-dump.sh --force

backup: ## Download database backups from remote
	@./scripts/download-backups.sh

# ─── Cleanup ────────────────────────────────────────

clean: ## Clean all build artifacts
	cargo clean
	rm -rf docs/.next docs/out

# ─── Misc ───────────────────────────────────────────

token: ## Generate a new admin token
	@echo "ADMIN_TOKEN=$$(openssl rand -base64 32)"

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

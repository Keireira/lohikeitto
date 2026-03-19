.PHONY: dev dev-admin dev-docs openapi \
       build \
       up down logs ps \
       lint format check \
       migrate help

# ─── Development ────────────────────────────────────

dev: ## Start backend dev server (port 3000)
	cargo run

dev-admin: ## Start admin panel dev server (port 3001)
	pnpm --prefix admin run dev --port 3001

dev-docs: openapi ## Start docs dev server
	pnpm --prefix docs run dev --port 3333

openapi: ## Regenerate docs/public/openapi.json from Rust source
	cargo run -- --openapi > docs/public/openapi.json
	@echo "OpenAPI spec written to docs/public/openapi.json"

# ─── Build ──────────────────────────────────────────

build: ## Build Rust backend (release)
	cargo build --release

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
	pnpm biome check .
	cargo clippy -- -D warnings

format: ## Format all code (biome + cargo fmt)
	pnpm biome check --fix --unsafe .
	pnpm biome format --write .
	cargo fmt

check: ## Run all checks (lint + cargo check + clippy)
	pnpm biome check .
	cargo check
	cargo clippy -- -D warnings

# ─── Database ───────────────────────────────────────

migrate: ## Run SQLx database migrations
	cargo sqlx migrate run

# ─── Cleanup ────────────────────────────────────────

clean: ## Clean all build artifacts
	cargo clean

# ─── Help ───────────────────────────────────────────

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

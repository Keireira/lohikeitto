# Lohikeitto (Soup)

Service catalog with search, logos, categories, and an admin panel.

## Docs

Read the fucking docs from `make docs`

## Architecture

| Layer | Tech |
|-------|------|
| **API** | Rust (axum 0.8, sqlx, tokio, tower-http, reqwest) |
| **Admin** | Next.js 16, React 19, Tailwind CSS, React Compiler |
| **DB** | PostgreSQL 17 |
| **Storage** | S3-compatible (Cloudflare R2) |
| **Docs** | Fumadocs |

```
crates/
  api/        # Public API server (search, service lookup)
  admin/      # Admin API server (CRUD, S3 management, logo tools)
  shared/     # Shared models, DB pool, boot utilities
admin/        # Next.js admin panel
docs/         # Documentation site
migrations/   # SQL migrations
```

## Quick start

```bash
# 1. Set up environment
cp lohikeitto.env.example lohikeitto.env
cp admin.local.env.example admin.local.env

# 2. Run API + Admin
make dev    # API server on :3000
make admin  # Admin panel on :3001

# 3. Or use Docker
docker compose up -d
```


## Make commands

| Command | Description |
|---------|-------------|
| `make dev` | Run the API server |
| `make admin` | Run the admin panel (port 3001) |
| `make docs` | Run the documentation site |
| `make build` | Build release binary |

## License

[AGPL-3.0](LICENSE)

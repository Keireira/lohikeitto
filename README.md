# Lohikeitto (Soup)

Service catalog with search, logos, categories, and an admin panel.

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

## Admin panel

The admin panel provides:

- **Services** -- CRUD, search, filtering by category/verification status, pagination, URL state sync
- **Color Studio** -- Sample colors from logo with loupe magnifier, auto-average approximation, multi-format output (HEX/RGB/HSL/OKLCH), paste any CSS color format
- **Logo Studio** -- Fetch from Brandfetch/logo.dev, upload local, save to S3
- **Vectorize** -- Potrace (2-color WASM) and vtracer (multicolor server-side) with threshold/invert controls
- **Gradient Extractor** -- Detect linear/radial gradients from logo, auto angle detection, background/foreground target, auto/manual stops (2-100), copy CSS/SVG
- **S3 Browser** -- Navigate, upload, download (SSE progress), rename, delete, archive, image preview with thumbnails
- **Categories** -- Create, rename, delete, view services per category
- **Limbus** -- Review queue for discovered services, approve/reject

### Admin project structure

```
admin/
  app/              # Next.js App Router pages
  components/       # Decomposed component folders
    color-studio/   # Color sampling + format conversion
    s3-browser/     # S3 file management
    service-detail/ # Service editor with sub-components
    services-table/ # Table with filters, sorting, pagination
    vectorize-widget/ # SVG vectorization + gradient extraction
    pagination/     # Shared pagination components
    ...             # Flat components (sidebar, squircle, etc.)
  lib/              # Shared utilities, hooks, stores, types
  types/            # Ambient type declarations
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `LOGO_BASE_URL` | Yes | CDN base URL for service logos |
| `BRANDFETCH_CLIENT_ID` | Yes | Brandfetch client ID |
| `LOGODEV_TOKEN` | Yes | logo.dev API token |
| `CF_R2_S3_API` | Yes | R2 S3-compatible endpoint URL |
| `CF_R2_ACCOUNT_ACCESS_KEY_ID` | Yes | R2 access key ID |
| `CF_R2_ACCOUNT_SECRET_ACCESS_KEY` | Yes | R2 secret access key |
| `CF_R2_BUCKET` | Yes | R2 bucket name |
| `ADMIN_TOKEN` | Yes | Bearer token for admin endpoints |
| `CORS_ORIGIN` | No | Allowed origin (default `*`) |
| `HOST` | No | Bind address (default `0.0.0.0`) |
| `PORT` | No | Bind port (default `3000`) |

## Make commands

| Command | Description |
|---------|-------------|
| `make dev` | Run the API server |
| `make admin` | Run the admin panel (port 3001) |
| `make docs` | Run the documentation site |
| `make build` | Build release binary |

## License

[AGPL-3.0](LICENSE)

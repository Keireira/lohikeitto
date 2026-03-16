# Soup

```bash
# 1. Set up environment
cp .env.example .env

# 2. Run (migrations run automatically on startup)
cargo run
```

### Environment variables

| Variable                          | Required | Description                                      |
| --------------------------------- | -------- | ------------------------------------------------ |
| `DATABASE_URL`                    | Yes      | PostgreSQL connection string                     |
| `LOGO_BASE_URL`                   | Yes      | CDN base URL for service logos                   |
| `BRANDFETCH_CLIENT_ID`            | Yes      | Brandfetch client ID for search fallback & logos |
| `LOGODEV_TOKEN`                   | Yes      | logo.dev API token for logo fallback             |
| `CF_R2_S3_API`                    | Yes      | R2 S3-compatible endpoint URL                    |
| `CF_R2_ACCOUNT_ACCESS_KEY_ID`     | Yes      | R2 access key ID                                 |
| `CF_R2_ACCOUNT_SECRET_ACCESS_KEY` | Yes      | R2 secret access key                             |
| `CF_R2_BUCKET`                    | Yes      | R2 bucket name                                   |
| `ADMIN_TOKEN`                     | Yes      | Bearer token for admin endpoints                 |
| `CORS_ORIGIN`                     | No       | Allowed origin (default `*`, set domain in prod) |
| `HOST`                            | No       | Bind address (default `0.0.0.0`)                 |
| `PORT`                            | No       | Bind port (default `3000`)                       |

### Docker

```bash
docker compose up -d
```

Requires an external `sharkie-network` Docker network and a running PostgreSQL instance.

## API

See [API.md](API.md) for full endpoint documentation.

| Endpoint               | Auth  | Description                                       |
| ---------------------- | ----- | ------------------------------------------------- |
| `GET /search?q=`       | No    | Fuzzy search with Brandfetch fallback             |
| `GET /services/:id`    | No    | Service detail with localizations                 |
| `GET /init?locale=`    | No    | Preload services popular in a locale              |
| `GET /health`          | No    | Health check (DB liveness)                        |
| `POST /services/verify`| Admin | Verify services via Brandfetch, fill domains      |
| `POST /logos/sync`     | Admin | Download missing logos to R2                      |

## Setup flow

```bash
# 1. Generate admin token
openssl rand -base64 32

# 2. Start the server
cargo run

# 3. Verify services & populate domains (~15 min)
curl -X POST http://localhost:3000/services/verify \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 4. Review not_found list, remove invalid services

# 5. Download logos to R2 (~25-40 min)
curl -X POST http://localhost:3000/logos/sync \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

## Database schema

### `services`

| Column        | Type            | Description                             |
| ------------- | --------------- | --------------------------------------- |
| `id`          | UUID (PK)       | Service identifier                      |
| `name`        | TEXT            | English canonical name                  |
| `slug`        | TEXT (unique)   | URL-safe identifier, logo filename      |
| `domain`      | TEXT (nullable) | Domain for Brandfetch/logo.dev lookups  |
| `verified`    | BOOLEAN         | Verified via Brandfetch (default false) |
| `category_id` | UUID (nullable) | FK to categories                        |
| `colors`      | JSONB           | `{ primary: "#hex" }`                   |
| `links`       | JSONB           | `{ website, x, github, ... }`           |
| `locales`     | JSONB           | `["en","ja",...]` locales where popular |
| `ref_link`    | TEXT (nullable) | Referral link                           |

### `service_localizations`

Wide table — one column per locale, one row per service.

| Column          | Type      | Description                                      |
| --------------- | --------- | ------------------------------------------------ |
| `id`            | UUID (PK) | Same as service UUID                             |
| `bg`..`zh_hant` | TEXT      | Localized name per locale (32 columns, nullable) |

Trigram indexes on non-latin locale columns (ru, uk, ja, ko, zh_hans, zh_hant, th, hi, ka, el, bg, sr, kk).

## Security

- Admin endpoints protected by Bearer token (constant-time comparison)
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`
- Request timeout: 30s
- Body size limit: 2MB
- Input validation: query length, locale length, count clamping
- CORS: configurable origin (`CORS_ORIGIN`)
- Structured JSON logging via `tracing`
- Request IDs (`X-Request-Id`) for tracing

## License

[AGPL-3.0](LICENSE)

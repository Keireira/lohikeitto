# Lohikeitto

Brand metadata API for [uha](https://uha.app). Provides service search, detail lookups, and locale-aware preloading for 2300+ services across 20 categories and 32 locales.

## Stack

- **Backend:** Rust / Axum / SQLx
- **Database:** PostgreSQL (pg_trgm for fuzzy search)

## Quick start

```bash
# 1. Set up environment
cp .env.example .env  # DATABASE_URL, LOGO_BASE_URL, HOST, PORT

# 2. Run (migrations run automatically on startup)
cargo run
```

### Environment variables

| Variable       | Required | Description                          |
| -------------- | -------- | ------------------------------------ |
| `DATABASE_URL` | Yes      | PostgreSQL connection string         |
| `LOGO_BASE_URL`| Yes      | CDN base URL for service logos       |
| `HOST`         | No       | Bind address (default `0.0.0.0`)     |
| `PORT`         | No       | Bind port (default `3000`)           |

### Docker

```bash
docker compose up -d
```

Requires an external `sharkie-network` Docker network and a running PostgreSQL instance.

## API

See [API.md](API.md) for full endpoint documentation.

| Endpoint                  | Description                              |
| ------------------------- | ---------------------------------------- |
| `GET /search?q=&locale=`  | Fuzzy search by name or localized alias  |
| `GET /services/:id`       | Service detail with localizations        |
| `GET /init?locale=&category=` | Preload services popular in a locale |
| `GET /health`             | Health check                             |

## Database schema

### `services`

| Column     | Type        | Description                          |
| ---------- | ----------- | ------------------------------------ |
| `id`       | UUID (PK)   | Service identifier                   |
| `name`     | TEXT        | English canonical name               |
| `slug`     | TEXT (unique)| URL-safe identifier, logo filename  |
| `category` | TEXT        | One of 20 categories                 |
| `colors`   | JSONB       | `{ primary: "#hex" }`               |
| `links`    | JSONB       | `{ website, x, github, ... }`       |
| `locales`  | JSONB       | `["en","ja",...]` locales where popular |
| `localization_id` | UUID (FK) | References `service_localizations(id)` |
| `default_locale` | TEXT      | Service origin locale (default `en`) |
| `ref_link` | TEXT (nullable) | Referral link                     |

### `service_localizations`

Wide table — one column per locale, one row per service.

| Column   | Type      | Description                   |
| -------- | --------- | ----------------------------- |
| `id`     | UUID (PK) | Same as service UUID          |
| `bg`..`zh_hant` | TEXT | Localized name per locale (32 columns, nullable) |

Trigram indexes on non-latin locale columns (ru, uk, ja, ko, zh_hans, zh_hant, th, hi, ka, el, bg, sr, kk).

## License

[AGPL-3.0](LICENSE)

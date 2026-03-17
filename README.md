# Lohikeitto (Soup)

Service catalog API with search, logos, and categories.

```bash
# 1. Set up environment
cp .env.example .env

# 2. Edit .env with your configuration

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

Requires an external `sharkie-network` Docker network and a running PostgreSQL instance (check `Keireira/sharkie` repo)

## Make commands

| Command      | Description                      |
| ------------ | -------------------------------- |
| `make dev`   | Run the API server               |
| `make admin` | Run the admin panel (port 3001)  |
| `make docs`  | Run the documentation site       |
| `make build` | Build release binary             |

## License

[AGPL-3.0](LICENSE)

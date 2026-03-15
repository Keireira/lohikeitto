# Lohikeitto API

Base URL: `https://soup.uha.com`

All responses are JSON (UTF-8).

## Endpoints

### GET /search

Search services by name, phonetic aliases, or localized names (trigram search).

**Query parameters:**

| Parameter | Type   | Required | Description                                                                 |
| --------- | ------ | -------- | --------------------------------------------------------------------------- |
| `q`       | string | Yes      | Search query                                                                |
| `count`   | int    | No       | Number of results (default 10, max 10)                                      |
| `locale`  | string | No       | Locale for alias search (`ru`, `ja`, `ko`, etc.). Omit to search all locales |

**Response (200):**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Adguard",
    "colors": {
      "primary": "#354537"
    },
    "logo_url": "https://cdn.example.com/adguard.webp"
  }
]
```

Returns empty array `[]` if nothing found.

---

### GET /services/:service_id

Service details by UUID. Includes localized names from `service_localizations`.

**Response (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Adguard",
  "colors": {
    "primary": "#354537"
  },
  "category": "VPN & Security",
  "aliases": {
    "ru": ["адгард"],
    "ja": ["アドガード"],
    "ko": ["애드가드"]
  },
  "logo_url": "https://cdn.example.com/adguard.webp",
  "links": {
    "website": "https://adguard.com",
    "x": "https://x.com/adguard",
    "github": "https://github.com/adguard",
    "linkedin": "https://linkedin.com/company/adguard"
  },
  "locales": ["de", "en", "es", "fr", "ja", "ko", "ru"],
  "localizations": [
    { "locale": "ru", "name": "Адгард" },
    { "locale": "ja", "name": "アドガード" }
  ],
  "ref_link": "https://adguard.com?ref=1234567890",
  "created_at": "2025-03-15T00:00:00Z"
}
```

`ref_link` may be `null`. `localizations` is an array of `{ locale, name }` pairs.

---

### GET /init

Preload services popular in a given locale. Used by the mobile app to preload service data on first launch.

**Query parameters:**

| Parameter  | Type   | Required | Description                                  |
| ---------- | ------ | -------- | -------------------------------------------- |
| `locale`   | string | Yes      | Locale code (`en`, `ja`, `ru`, etc.)         |
| `category` | string | No       | Filter by category (e.g. `Music`)            |

**Response (200):**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Spotify",
    "slug": "spotify",
    "category": "Music",
    "colors": {
      "primary": "#1DB954"
    },
    "logo_url": "https://cdn.example.com/spotify.webp",
    "localized_name": "スポティファイ"
  }
]
```

`localized_name` is `null` if no localization exists for that locale.

---

### GET /health

**Response (200):**

```json
{
  "status": "ok"
}
```

---

## Errors

```json
{
  "status": "error",
  "code": 400,
  "message": "Missing required parameter: q"
}
```

| Code | When                              |
| ---- | --------------------------------- |
| 400  | Missing `q` in /search, missing `locale` in /init |
| 404  | Service not found by ID           |
| 500  | Internal error (database, etc.)   |

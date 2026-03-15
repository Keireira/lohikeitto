# Lohikeitto API

Base URL: `https://lohikeitto.keireira.com`

All responses are JSON (UTF-8).

## Endpoints

### GET /search

Search services by name or phonetic aliases (trigram search).

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

Service details by UUID.

**Response (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Adguard",
  "colors": {
    "primary": "#354537"
  },
  "category": "antivirus",
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
  "ref_link": "https://adguard.com?ref=1234567890"
}
```

`ref_link` may be `null`.

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
| 400  | Missing `q` in /search            |
| 404  | Service not found by ID           |
| 500  | Internal error (database, etc.)   |

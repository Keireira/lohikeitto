# Lohikeitto API

Base URL: `https://soup.uha.app`

All responses are JSON (UTF-8) with a unified envelope:

```
{ "status": "success", "data": T }        // on success
{ "status": "error", "code": N, "message": "..." }  // on error
```

## Endpoints

### GET /search

Search services by name or localized names (trigram search).

**Query parameters:**

| Parameter | Type   | Required | Description                                                                  |
| --------- | ------ | -------- | ---------------------------------------------------------------------------- |
| `q`       | string | Yes      | Search query                                                                 |
| `count`   | int    | No       | Number of results (default 10, max 10)                                       |
| `locales` | string | No       | Locale codes, repeatable (`locales=ru&locales=en`). Omit to search name only |

**Response (200):**

```json
{
	"status": "success",
	"data": [
		{
			"id": "550e8400-e29b-41d4-a716-446655440000",
			"name": "Adguard",
			"colors": {
				"primary": "#354537"
			},
			"logo_url": "https://cdn.example.com/adguard.webp"
		}
	]
}
```

`data` is an empty array `[]` if nothing found.

---

### GET /services/:service_id

Service details by UUID.

**Response (200):**

```json
{
	"status": "success",
	"data": {
		"id": "550e8400-e29b-41d4-a716-446655440000",
		"name": "Adguard",
		"colors": {
			"primary": "#354537"
		},
		"category_id": "44444444-0000-0000-0000-000000000011",
		"category": "VPN & Security",
		"logo_url": "https://cdn.example.com/adguard.webp",
		"links": {
			"website": "https://adguard.com",
			"x": "https://x.com/adguard",
			"github": "https://github.com/adguard",
			"linkedin": "https://linkedin.com/company/adguard"
		},
		"localizations": {
			"ru": "Адгард",
			"ja": "アドガード"
		},
		"default_locale": "en",
		"ref_link": "https://adguard.com?ref=1234567890"
	}
}
```

`ref_link` may be `null`. `localizations` is a `{ locale: name }` object (only non-null locales included).

---

### GET /init

Returns all services available in a given locale. Same shape as `GET /services/:service_id`, wrapped in an array.

**Query parameters:**

| Parameter | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| `locale`  | string | Yes      | Locale code (`en`, `ja`, `ru`, etc.) |

**Response (200):**

```json
{
	"status": "success",
	"data": [
		{
			"id": "550e8400-e29b-41d4-a716-446655440000",
			"name": "Spotify",
			"colors": {
				"primary": "#1DB954"
			},
			"category_id": "44444444-0000-0000-0000-000000000002",
			"category": "Music",
			"logo_url": "https://cdn.example.com/spotify.webp",
			"links": {
				"website": "https://spotify.com"
			},
			"localizations": {
				"ja": "スポティファイ"
			},
			"default_locale": "en",
			"ref_link": null
		}
	]
}
```

---

### GET /health

**Response (200):**

```json
{
	"status": "success",
	"data": null
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

| Code | When                                              |
| ---- | ------------------------------------------------- |
| 400  | Missing `q` in /search, missing `locale` in /init |
| 404  | Service not found by ID                           |
| 500  | Internal error (database, etc.)                   |

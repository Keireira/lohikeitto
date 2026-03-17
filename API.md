# Lohikeitto API

Base URL: `https://soup.uha.app`

All responses are JSON (UTF-8) with a unified envelope:

```
{ "status": "success", "data": T }        // on success
{ "status": "error", "code": N, "message": "..." }  // on error
```

## Public endpoints

### GET /search

Search services by name (trigram search). Falls back to Brandfetch when local results are insufficient.

**Query parameters:**

| Parameter | Type   | Required | Description                    |
| --------- | ------ | -------- | ------------------------------ |
| `q`       | string | Yes      | Search query (max 200 chars)   |
| `count`   | int    | No       | Number of results (default 10, max 10) |

**Response (200):**

```json
{
	"status": "success",
	"data": [
		{
			"source": "local",
			"id": "550e8400-e29b-41d4-a716-446655440000",
			"name": "Adguard",
			"logo_url": "https://cdn.example.com/adguard.webp"
		},
		{
			"source": "brandfetch",
			"name": "AdGuard",
			"domain": "adguard.com",
			"icon": "https://cdn.brandfetch.io/idbeBCDlpy/w/128/h/128/fallback/lettermark/icon.webp?c=..."
		}
	]
}
```

`data` is an empty array `[]` if nothing found. Each result has a `source` field: `"local"` for database results, `"brandfetch"` for fallback results.

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
			"website": "https://adguard.com"
		},
		"ref_link": "https://adguard.com?ref=1234567890"
	}
}
```

`category_id` is omitted when not set. `ref_link` is omitted when `null`.

---

### GET /init

Returns services available in a given country. Same shape as `GET /services/:service_id`, wrapped in an array. Limited to 20 services per category.

**Query parameters:**

| Parameter | Type   | Required | Description                                |
| --------- | ------ | -------- | ------------------------------------------ |
| `country` | string | Yes      | Country code (`en`, `ja`, `ru`, max 10 ch) |

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
			"links": {}
		}
	]
}
```

---

### GET /health

Returns `"ok"` with 200 if database is reachable, 503 otherwise.

---

## Admin endpoints

All admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>` header. Returns 401 without valid token.

### GET /admin/services?filter=

List services. Filter: `all` (default), `verified`, `unverified`.

### GET /admin/services/:id

Full service details for admin panel.

### PUT /admin/services/:id

Update service fields (name, slug, domain, category_id, colors, links, countries, ref_link).

### DELETE /admin/services/:id

Delete a service.

### PUT /admin/services/:id/approve

Set `verified = true`.

### POST /admin/services/:id/sync-logos

Download logos from Brandfetch and logo.dev, upload to R2.

### POST /admin/services/:id/save-logo

Save a single logo type (`bf_logo`, `bf_symbol`, `logodev`) to R2.

### GET /admin/categories

List all categories.

### GET /admin/export-sql?filter=

Export services as SQL INSERT statement. Accepts `filter` (`all`, `verified`, `unverified`) or `ids` (comma-separated UUIDs). Returns the SQL in the response `data` field.

### POST /services/verify

Checks each unverified service against Brandfetch search API. If found, sets `verified=true` and fills `domain`. Throttled (150-400ms per request).

**Response (200):**

```json
{
	"status": "success",
	"data": {
		"total": 2375,
		"verified_count": 2100,
		"not_found_count": 250,
		"error_count": 25,
		"verified": [
			{ "name": "Spotify", "domain": "spotify.com" }
		],
		"not_found": ["Some Unknown Service"],
		"errors": [
			{ "name": "Foo", "error": "HTTP 429" }
		]
	}
}
```

---

### POST /logos/sync

Downloads logos for all services with `domain` set. Fetches from Brandfetch CDN and logo.dev, uploads to R2. Skips files already present. Throttled (150-400ms per request).

R2 paths: `bf/logos/{slug}.webp`, `bf/symbols/{slug}.webp`, `logodev/{slug}.webp`.

**Response (200):**

```json
{
	"status": "success",
	"data": [
		{
			"slug": "adguard",
			"domain": "adguard.com",
			"result": {
				"bf_logo": true,
				"bf_symbol": true,
				"logodev": true
			}
		}
	]
}
```

`*_existed: true` fields appear when the file was already in R2.

---

## Errors

```json
{
	"status": "error",
	"code": 400,
	"message": "Missing required parameter: q"
}
```

| Code | When                                                  |
| ---- | ----------------------------------------------------- |
| 400  | Invalid/missing parameters                            |
| 401  | Missing or invalid admin token on admin endpoints     |
| 404  | Service not found by ID                               |
| 408  | Request timeout (30s)                                 |
| 500  | Internal error (database, storage, etc.)              |

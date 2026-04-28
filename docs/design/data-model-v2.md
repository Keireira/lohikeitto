# Data Model v2: Organizations, Extended Services & Revision History

## Scope

Redesign the data layer to support:
- Company -> service hierarchy
- Git-like revision history for service data and logos
- Extended service metadata (socials, description, banner, colors palette)

---

## 1. Organizations

Root entity representing a company/brand. Services attach to it via `org_id`.

```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,                     -- "Adobe"
    slug            TEXT NOT NULL UNIQUE,               -- "adobe"
    bundle_id       TEXT NOT NULL UNIQUE,               -- "com.adobe"
    description     TEXT,
    website         TEXT,
    country         TEXT,                               -- ISO 3166-1 alpha-2 ("US", "RU", ...)
    verified        BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Key points:**
- Org is NOT a service. It has no category, platforms, or service-level flags.
- Branding of the org itself (logo, colors) lives on the `com.adobe.root` service.
- Standalone services (no parent company) -> `org_id = NULL`.
- `bundle_id` always uses the `com.{brand}` prefix regardless of actual domain TLD (`com.figma`, not `io.figma`).
- `slug` is human-readable, used in URLs and file paths.

**Example mapping:**

| Organization | bundle_id | Services |
|---|---|---|
| Adobe | `com.adobe` | `com.adobe.root`, `com.adobe.lightroom`, `com.adobe.premiere` |
| Apple | `com.apple` | `com.apple.root`, `com.apple.music`, `com.apple.tv` |
| Spotify | `com.spotify` | `com.spotify.root` (single-product company) |

---

## 2. Services — extended schema

```sql
CREATE TABLE services (
    -- Identity (immutable, never versioned)
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Pointer to latest revision
    head_id         UUID,  -- FK to service_revisions.id, added after table creation

    -- Current materialized state (denormalized from HEAD revision for fast reads)
    -- EVERYTHING below is versioned — stored in revisions, mirrored here for fast reads
    org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,
    slug            TEXT NOT NULL UNIQUE,
    bundle_id       TEXT NOT NULL UNIQUE,
    category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    colors          JSONB NOT NULL DEFAULT '[]',
    logo_path       TEXT,
    banner_path     TEXT,
    social_links    JSONB NOT NULL DEFAULT '{}',
    domains         TEXT[] NOT NULL DEFAULT '{}',
    ref_link        TEXT,
    platforms       TEXT[] NOT NULL DEFAULT '{}',
    alternative_names TEXT[] NOT NULL DEFAULT '{}',
    tags            TEXT[] NOT NULL DEFAULT '{}',

    -- Flags (also versioned)
    verified        BOOLEAN NOT NULL DEFAULT false,
    discontinued    BOOLEAN NOT NULL DEFAULT false,  -- service is dead/shut down
    archived        BOOLEAN NOT NULL DEFAULT false,  -- soft delete; auto-set to true when discontinued

    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The services table holds two things:
1. **Identity** — `id` and `created_at`. Immutable after creation.
2. **Materialized current state** — everything else is denormalized from HEAD revision. Updated on every new revision. This is what search and public API read — no joins needed.

**Flags:**
- `verified` — curated/confirmed service.
- `discontinued` — service is dead (shut down by the company). Setting this auto-sets `archived = true`.
- `archived` — soft delete. Hidden from public search, visible in admin. Can be set independently of `discontinued` (e.g., temporarily hiding a service). Hard delete = actual `DELETE` from DB.

**Everything except `id` and `created_at` is versioned.** Slug, bundle_id, org_id, category_id, verified, discontinued, archived — all tracked in revision history.

---

## 3. Revision History (git-like changesets)

### Core concept

Every change to a service creates a new **revision** containing only the **changeset** — the fields that actually changed. Like a git commit stores a diff, not a full copy of the repo.

```
Service "lightroom"
  head_id ──-> rev 5  changes: {discontinued: true, archived: true}
                 └─ parent -> rev 4  changes: {colors: [...]}          "rebrand"
                                └─ parent -> rev 3  changes: {logo_path: "logos/lightroom/v3.webp"}
                                               └─ parent -> rev 2  changes: {description: "Photo editor by Adobe"}
                                                              └─ parent -> rev 1  changes: {name: "Lightroom", slug: "lightroom", ...} (initial — full state)
```

### Schema

```sql
CREATE TABLE service_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES service_revisions(id),  -- NULL for rev 1 (initial)
    revision        INT NOT NULL,                            -- sequential: 1, 2, 3, ...

    -- The changeset: ONLY the fields that changed in this revision
    changes         JSONB NOT NULL,
    -- rev 1 (initial):  {"name": "Lightroom", "description": "...", "colors": [...], ...}
    -- rev 2+:           {"description": "New description"}  — only what's different

    -- Audit
    change_summary  TEXT,                                    -- commit message
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(service_id, revision)
);

-- FK from services to revisions (circular, added after both tables exist)
ALTER TABLE services
    ADD CONSTRAINT fk_services_head
    FOREIGN KEY (head_id) REFERENCES service_revisions(id);

CREATE INDEX idx_revisions_service ON service_revisions(service_id, revision DESC);
CREATE INDEX idx_revisions_parent ON service_revisions(parent_id);
```

### How it works

**Creating a service** -> revision 1 is created with the full initial state in `changes`. The same data is written to the materialized fields on `services`.

**Updating a service** -> new revision is created with only the changed fields in `changes`. The corresponding fields on `services` are updated (merged).

**Reading current state** -> just `SELECT * FROM services`. No joins, no reconstruction. The materialized state is always up to date.

**Reading a specific historical revision** -> fold `changes` from rev 1 through rev N:
```sql
SELECT changes FROM service_revisions
WHERE service_id = :id AND revision <= :target_rev
ORDER BY revision ASC;
```
Then merge the JSONB objects sequentially: `rev1 || rev2 || ... || revN`. Each subsequent changeset overrides the keys it touches.

**Viewing what changed in a revision** -> just read `changes` directly. It IS the diff.

**Diffing two arbitrary revisions** -> reconstruct state at rev A and rev B, compare.

**Reverting to revision N** -> reconstruct state at N, compute the diff against current HEAD, create a new revision with that diff. History only grows forward.

**Squashing (reset root)** -> pick any revision N as the new root. Reconstruct full state at N, replace its `changes` with the full state snapshot, set `parent_id = NULL`. Delete all revisions before N. Revision N becomes the new initial commit. Like `git replace --graft` + `gc`.

### Design decisions

**Changesets, not snapshots.** Each revision stores only what changed. Rationale:
- Natural diff view — `changes` is literally what was modified, ready to display in UI.
- Storage-efficient — no duplication of unchanged fields.
- Mirrors git mental model: each commit = a set of changes.

**Materialized current state on services.** The `services` table is denormalized — it always reflects the result of applying all revisions. Rationale:
- Search and public API are the hot path. They must not pay the cost of folding a revision chain.
- Writes are infrequent (admin edits), reads are constant (search queries).
- One extra write on update is cheap.

**Reconstruction cost.** To view historical state, you fold N revisions. For a service with 50 revisions, that's 50 small JSONB merges — trivial. If it ever matters, add periodic checkpoint revisions (full snapshots) as an optimization, but don't design for it now.

**Revisions are kept forever.** No auto-pruning. But the squash operation allows resetting the root — making any revision the new initial commit and deleting everything before it.

**What's versioned vs what's not:**

| Immutable (only on `services`) | Versioned (in `changes` JSONB, mirrored on `services`) |
|---|---|
| id | everything else |
| created_at | slug, bundle_id, org_id, category_id, name, description |
| | colors, logo_path, banner_path, social_links, domains |
| | ref_link, platforms, alternative_names, tags |
| | verified, discontinued, archived |

---

## 4. Colors format

Old format:
```json
{"primary": "#D93731"}
```

New format — array of named colors with roles:
```json
[
  {"hex": "#D93731", "title": "Adobe Red",  "role": "primary"},
  {"hex": "#2C2C2C", "title": "Dark",       "role": "background"},
  {"hex": "#FF4040", "title": "Accent",     "role": "accent"}
]
```

Rules:
- `hex` — required, 6-digit hex with `#` prefix.
- `title` — required, human-readable name.
- `role` — optional. One of: `primary`, `secondary`, `accent`, `background`, `text`. At least one entry should have `role: "primary"`.
- Array order matters: first entry is the default/primary if no roles are set.

---

## 5. Social links format

Flat object, keys are platform identifiers, values are full URLs:

```json
{
  "x":         "https://x.com/adobe",
  "instagram": "https://instagram.com/adobe",
  "github":    "https://github.com/adobe",
  "youtube":   "https://youtube.com/@adobe",
  "discord":   "https://discord.gg/xxx",
  "telegram":  "https://t.me/xxx",
  "linkedin":  "https://linkedin.com/company/adobe",
  "bluesky":   "https://bsky.app/profile/adobe.bsky.social",
  "mastodon":  "https://mastodon.social/@adobe",
  "tiktok":    "https://tiktok.com/@adobe",
  "reddit":    "https://reddit.com/r/adobe",
  "facebook":  "https://facebook.com/adobe",
  "threads":   "https://threads.net/@adobe",
  "twitch":    "https://twitch.tv/adobe",
  "vk":        "https://vk.com/adobe"
}
```

No fixed enum — any string key is valid. This keeps it extensible without schema changes when new platforms appear.

---

## 6. Logo storage in S3

### Path convention

```
logos/
├── lightroom/
│   ├── v1.webp           ← initial logo (referenced by revisions 1-2)
│   ├── v3.webp           ← new logo uploaded at revision 3
│   └── current.webp      ← copy of whatever HEAD points to
├── spotify/
│   ├── v1.webp
│   └── current.webp
```

- `logos/{slug}/current.webp` — always serves the latest logo. Updated on every revision that changes the logo. This is what the public search API returns.
- `logos/{slug}/v{revision}.webp` — immutable, never overwritten. Only created when the logo actually changes.
- Revisions that don't change the logo inherit `logo_path` from parent.

### Flow: creating a revision with a new logo

1. Upload new logo to `logos/{slug}/v{N}.webp`
2. Create revision with `logo_path = "logos/{slug}/v{N}.webp"`
3. Copy to `logos/{slug}/current.webp`
4. Update `services.head_id`

### Public logo URL

Search API keeps returning `{s3_base_url}/logos/{slug}/current.webp` — no breaking change for consumers.

---

## 7. Additional fields explained

### `alternative_names: TEXT[]`

Aliases for search. Handles:
- Localized names: `["ВКонтакте", "VK"]`
- Common abbreviations: `["AWS", "Amazon Web Services"]`
- Former names: `["Twitter", "X"]`

The search query should match against `name` + `alternative_names` combined.

### `tags: TEXT[]`

Free-form tags that complement the single `category_id`:
```json
["anime", "streaming", "japanese"]
```

Use cases: filtering, faceted search, related services. Not a replacement for categories — tags are loose, categories are curated.

### `platforms: TEXT[]`

Where the service is available:
```json
["web", "ios", "android", "macos", "windows", "linux"]
```

Fixed vocabulary (enforced at app level, not DB).

---

## 8. Indexes

```sql
-- Organizations
CREATE INDEX idx_org_bundle ON organizations(bundle_id);

-- Services (current state is denormalized, so search indexes work directly)
CREATE INDEX idx_services_org ON services(org_id);
CREATE INDEX idx_services_bundle ON services(bundle_id);
CREATE INDEX idx_services_name_trgm ON services USING gin (name gin_trgm_ops);
CREATE INDEX idx_services_alt_names ON services USING gin (alternative_names);
CREATE INDEX idx_services_tags ON services USING gin (tags);

-- Revisions
CREATE INDEX idx_revisions_service ON service_revisions(service_id, revision DESC);
CREATE INDEX idx_revisions_parent ON service_revisions(parent_id);
```

**Search:** no concern here. Since the services table holds the materialized current state, trigram search on `name` and GIN search on `alternative_names` work directly — no joins with revisions needed on the hot path.

---

## 9. API design for revisions

### Admin endpoints

```
POST   /services                              -> create service + initial revision
PUT    /services/:id                          -> create new revision (partial update — merge with HEAD)
DELETE /services/:id                          -> hard delete (service + all revisions)
GET    /services/:id/revisions                -> list all revisions (paginated, newest first)
GET    /services/:id/revisions/:revision      -> get specific revision (reconstructed full state)
POST   /services/:id/revisions/:revision/revert -> create new revision from old snapshot
POST   /services/:id/revisions/:revision/squash -> make this revision the new root, delete all prior
GET    /services/:id/diff?from=3&to=5         -> diff between two revisions
```

### Public API (search)

No changes needed — search returns the current state (resolved from HEAD revision). Logo URL keeps using `current.webp`.

### Admin UI features

- **Timeline view:** vertical list of revisions with change_summary, timestamp, and `changes` keys (which fields were touched).
- **Revision detail:** shows the changeset directly — what fields changed and to what values. Option to expand to full reconstructed state.
- **Revert button:** reconstructs state at target revision, diffs against HEAD, creates new revision with the reverse changeset.
- **Side-by-side compare:** pick any two revisions, reconstruct both states, show field-level diff.

---

## 10. Organization versioning

**Not in scope for v2.** Orgs change rarely (rebrandings). If needed later, the same pattern applies: `organization_revisions` table, `head_id` pointer.

For now, org-level branding (logo, colors, social links) lives on the `*.root` service under that org, which IS versioned.

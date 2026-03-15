CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE services (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    category    TEXT NOT NULL,
    aliases     JSONB NOT NULL DEFAULT '{}',
    colors      JSONB NOT NULL,
    links       JSONB NOT NULL DEFAULT '{}',
    ref_link    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_name_trgm ON services USING gin (name gin_trgm_ops);
CREATE INDEX idx_services_aliases ON services USING gin (aliases jsonb_path_ops);

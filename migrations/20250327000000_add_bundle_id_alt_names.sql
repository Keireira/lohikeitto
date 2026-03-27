ALTER TABLE services ADD COLUMN bundle_id TEXT UNIQUE;
ALTER TABLE services ADD COLUMN alternative_names TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_services_bundle ON services(bundle_id);
CREATE INDEX idx_services_alt_names ON services USING gin (alternative_names);

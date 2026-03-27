ALTER TABLE services ADD COLUMN description TEXT;
ALTER TABLE services ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE services ADD COLUMN social_links JSONB NOT NULL DEFAULT '{}';

CREATE INDEX idx_services_tags ON services USING gin (tags);

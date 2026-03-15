-- Add locales column: which locales this service is popular in (for preloading by locale)
ALTER TABLE services ADD COLUMN locales JSONB NOT NULL DEFAULT '[]';

-- Localized service names per locale
CREATE TABLE service_localizations (
    service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    locale      TEXT NOT NULL,
    name        TEXT NOT NULL,
    PRIMARY KEY (service_id, locale)
);

CREATE INDEX idx_service_localizations_locale ON service_localizations(locale);
CREATE INDEX idx_service_localizations_name_trgm ON service_localizations USING gin (name gin_trgm_ops);
CREATE INDEX idx_services_locales ON services USING gin (locales jsonb_path_ops);

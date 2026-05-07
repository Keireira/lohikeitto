ALTER TABLE limbus
    ADD COLUMN description   TEXT,
    ADD COLUMN bundle_id     TEXT,
    ADD COLUMN category_slug TEXT REFERENCES categories(slug),
    ADD COLUMN tags          TEXT[] NOT NULL DEFAULT '{}';

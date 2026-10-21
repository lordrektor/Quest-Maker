-- Chronos quests and pools as the plugin exported them (or the web creator saved them)
CREATE TABLE IF NOT EXISTS definitions (
    kind       TEXT    NOT NULL CHECK (kind IN ('quest', 'pool')),
    id         TEXT    NOT NULL,
    body       TEXT    NOT NULL,              -- the canonical JSON tree
    version    INTEGER NOT NULL,              -- the version in the plugin's store when exported
    updated_at INTEGER NOT NULL,              -- epoch millis
    updated_by TEXT,
    source     TEXT    NOT NULL DEFAULT 'server' CHECK (source IN ('server', 'web')),
    server     TEXT,
    PRIMARY KEY (kind, id)
);

-- One-time pins for the web creator's login (/chronos cl otp)
CREATE TABLE IF NOT EXISTS otps (
    code       TEXT    NOT NULL,
    owner_key  TEXT    NOT NULL,              -- the player's uuid, or 'console'
    owner_type TEXT    NOT NULL CHECK (owner_type IN ('player', 'console')),
    owner_uuid TEXT,
    owner_name TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS otps_code ON otps (code);
CREATE INDEX IF NOT EXISTS otps_owner ON otps (owner_key);

-- Ids of other plugins' content, for the web creator's pick lists (/chronos cl refs)
CREATE TABLE IF NOT EXISTS refs (
    provider  TEXT    NOT NULL,              -- vulcan, tyche, exptailor, chrysos
    kind      TEXT    NOT NULL,              -- items, bosses, expertise, currencies...
    id        TEXT    NOT NULL,
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (provider, kind, id)
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1');

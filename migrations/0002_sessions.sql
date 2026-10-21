-- Website logins: a code from /chronos cl otp becomes a session (the cookie holds the token, this table its hash)
CREATE TABLE IF NOT EXISTS sessions (
    token_hash   TEXT    PRIMARY KEY,         -- hex SHA-256 of the cookie's token
    owner_type   TEXT    NOT NULL CHECK (owner_type IN ('player', 'console')),
    owner_uuid   TEXT,
    owner_name   TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);

-- Wrong codes, counted per IP and in total, so six digits cannot be guessed
CREATE TABLE IF NOT EXISTS login_failures (
    bucket       TEXT    PRIMARY KEY,         -- 'ip:<address>' or 'all'
    window_start INTEGER NOT NULL,
    failures     INTEGER NOT NULL
);

INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '2');

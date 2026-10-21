-- The web creator: what the plugin knows (catalog), workspaces, the canvas layout of each quest, and which quests
-- were edited on the web since the game last downloaded them.

-- /chronos cl types: one row per section (types, quest_fields, server, lists, vanilla), each a JSON object.
CREATE TABLE IF NOT EXISTS catalog (
    section   TEXT    NOT NULL PRIMARY KEY,
    body      TEXT    NOT NULL,
    synced_at INTEGER NOT NULL,
    server    TEXT
);

-- A workspace: one canvas of quests, opened by its name (never listed). body = { v, quests: [{ id, x, y, open }], viewport }.
CREATE TABLE IF NOT EXISTS workspaces (
    name       TEXT    NOT NULL PRIMARY KEY,
    body       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
);

-- Where a quest's parts sit inside its box. Kept out of the quest's body, so moving a node never changes the quest.
CREATE TABLE IF NOT EXISTS layouts (
    kind       TEXT    NOT NULL CHECK (kind = 'quest'),
    id         TEXT    NOT NULL,
    layout     TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (kind, id)
);

-- 1: saved on the web after the game's last download; cl export leaves it alone (unless forced).
ALTER TABLE definitions ADD COLUMN web_pending INTEGER NOT NULL DEFAULT 0;

INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '3');

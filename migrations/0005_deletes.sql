-- Quests deleted on the website. The row stays (deleted_at set, web_pending = 1) until the game's next download deletes
-- the quest there too; deleted_from names the workspace it was deleted from, so downloading that workspace takes the
-- delete as well. The website treats such a row as missing.
ALTER TABLE definitions ADD COLUMN deleted_at INTEGER;
ALTER TABLE definitions ADD COLUMN deleted_from TEXT;

-- Whether a code (and the session it becomes) may delete quests: the player had chronos.cloudflare.delete.
ALTER TABLE otps ADD COLUMN can_delete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN can_delete INTEGER NOT NULL DEFAULT 0;

INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '5');

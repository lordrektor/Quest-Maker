-- A display name for a reference id (an NPC's name, a conversation's title...), shown beside the id in the creator's pick
-- lists. NULL when the plugin sent none; the id is what quests store either way.
ALTER TABLE refs ADD COLUMN label TEXT;

INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '6');

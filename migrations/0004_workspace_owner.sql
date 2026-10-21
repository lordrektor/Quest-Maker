-- Who a workspace belongs to: the player's UUID, or 'console', of whoever created it. The creator lists a person's own
-- workspaces (and only those); anyone signed in can still open a workspace by its name.
ALTER TABLE workspaces ADD COLUMN owner_key TEXT;
CREATE INDEX IF NOT EXISTS workspaces_owner ON workspaces (owner_key, updated_at);

INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '4');

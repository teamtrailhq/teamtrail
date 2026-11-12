/**
 * The Postgres schema, applied on start under an advisory lock (idempotent). No table holds message text: workspaces keep a sealed bot
 * token, links a hash of their token, installs and codes only hashes and expiry, marks only
 * ids (channel, timestamp, view) a link owns.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS scout_workspaces (
  team_id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  bot_user_id TEXT NOT NULL,
  bot_token TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  installed_by TEXT NOT NULL,
  installed_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS scout_links (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES scout_workspaces(team_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  last_seen_at BIGINT
);
CREATE INDEX IF NOT EXISTS scout_links_user ON scout_links (team_id, user_id);
CREATE TABLE IF NOT EXISTS scout_installs (
  state_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS scout_marks (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  link_id TEXT NOT NULL REFERENCES scout_links(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (kind, key, link_id)
);
CREATE INDEX IF NOT EXISTS scout_marks_expiry ON scout_marks (expires_at);
CREATE TABLE IF NOT EXISTS scout_codes (
  code_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
`;

import pg from 'pg';
import type {
  Link,
  Mark,
  MarkKind,
  PendingCode,
  PendingInstall,
  ServiceConfig,
  ServiceStore,
  Workspace,
} from '../types';
import { SCHEMA } from './schema';

type Row = Record<string, unknown>;

/** An arbitrary constant: the advisory lock the schema is applied under. */
const MIGRATION_LOCK = 7_211_017;

const SSL = { verify: { rejectUnauthorized: true }, 'no-verify': { rejectUnauthorized: false }, off: false } as const;

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

const toWorkspace = (r: Row): Workspace => ({
  teamId: String(r.team_id),
  teamName: String(r.team_name),
  botUserId: String(r.bot_user_id),
  botToken: String(r.bot_token),
  scopes: r.scopes as string[],
  installedBy: String(r.installed_by),
  installedAt: Number(r.installed_at),
});

const toLink = (r: Row): Link => ({
  id: String(r.id),
  teamId: String(r.team_id),
  userId: String(r.user_id),
  tokenHash: String(r.token_hash),
  createdAt: Number(r.created_at),
  lastSeenAt: num(r.last_seen_at),
});

/** The production store. Every query is parameterised; take* delete and return in one statement (single use). */
export class PostgresStore implements ServiceStore {
  private constructor(private pool: pg.Pool) {}

  static async open(connectionString: string, ssl: ServiceConfig['databaseSsl'] = 'verify') {
    const pool = new pg.Pool({ connectionString, max: 10, ssl: SSL[ssl] });
    const client = await pool.connect();
    try {
      // Two instances starting together (a deploy overlapping the old one) never migrate at once.
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
      await client.query(SCHEMA);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
      client.release();
    }
    return new PostgresStore(pool);
  }

  private async rows(sql: string, params: unknown[] = []) {
    return (await this.pool.query(sql, params)).rows as Row[];
  }

  async saveWorkspace(w: Workspace) {
    await this.rows(
      `INSERT INTO scout_workspaces (team_id, team_name, bot_user_id, bot_token, scopes, installed_by, installed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (team_id) DO UPDATE SET team_name = $2, bot_user_id = $3, bot_token = $4, scopes = $5,
         installed_by = $6, installed_at = $7`,
      [w.teamId, w.teamName, w.botUserId, w.botToken, w.scopes, w.installedBy, w.installedAt],
    );
  }

  async workspace(teamId: string) {
    const [r] = await this.rows('SELECT * FROM scout_workspaces WHERE team_id = $1', [teamId]);
    return r && toWorkspace(r);
  }

  async removeWorkspace(teamId: string) {
    const links = await this.rows('DELETE FROM scout_links WHERE team_id = $1 RETURNING id', [teamId]);
    await this.rows('DELETE FROM scout_workspaces WHERE team_id = $1', [teamId]);
    return links.map((r) => String(r.id));
  }

  async saveLink(l: Link) {
    await this.rows(
      `INSERT INTO scout_links (id, team_id, user_id, token_hash, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [l.id, l.teamId, l.userId, l.tokenHash, l.createdAt, l.lastSeenAt ?? null],
    );
  }

  async link(id: string) {
    const [r] = await this.rows('SELECT * FROM scout_links WHERE id = $1', [id]);
    return r && toLink(r);
  }

  async linkByTokenHash(hash: string) {
    const [r] = await this.rows('SELECT * FROM scout_links WHERE token_hash = $1', [hash]);
    return r && toLink(r);
  }

  async linksOf(teamId: string, userId: string) {
    const rows = await this.rows(
      'SELECT * FROM scout_links WHERE team_id = $1 AND user_id = $2 ORDER BY created_at, id',
      [teamId, userId],
    );
    return rows.map(toLink);
  }

  async removeLink(id: string) {
    await this.rows('DELETE FROM scout_links WHERE id = $1', [id]);
  }

  async touchLink(id: string, at: number) {
    await this.rows('UPDATE scout_links SET last_seen_at = $2 WHERE id = $1', [id, at]);
  }

  async saveInstall(p: PendingInstall) {
    await this.rows(
      'INSERT INTO scout_installs (state_hash, challenge, return_url, expires_at) VALUES ($1, $2, $3, $4)',
      [p.stateHash, p.challenge, p.returnUrl, p.expiresAt],
    );
  }

  async takeInstall(stateHash: string, now: number) {
    const [r] = await this.rows('DELETE FROM scout_installs WHERE state_hash = $1 RETURNING *', [stateHash]);
    if (!r || Number(r.expires_at) <= now) return undefined;
    return {
      stateHash,
      challenge: String(r.challenge),
      returnUrl: String(r.return_url),
      expiresAt: Number(r.expires_at),
    };
  }

  async saveCode(c: PendingCode) {
    await this.rows(
      'INSERT INTO scout_codes (code_hash, challenge, team_id, user_id, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [c.codeHash, c.challenge, c.teamId, c.userId, c.expiresAt],
    );
  }

  async takeCode(codeHash: string, now: number) {
    const [r] = await this.rows('DELETE FROM scout_codes WHERE code_hash = $1 RETURNING *', [codeHash]);
    if (!r || Number(r.expires_at) <= now) return undefined;
    return {
      codeHash,
      challenge: String(r.challenge),
      teamId: String(r.team_id),
      userId: String(r.user_id),
      expiresAt: Number(r.expires_at),
    };
  }

  async mark(m: Mark) {
    await this.rows(
      `INSERT INTO scout_marks (kind, key, link_id, expires_at) SELECT $1, $2, $3, $4
       WHERE EXISTS (SELECT 1 FROM scout_links WHERE id = $3)
       ON CONFLICT (kind, key, link_id) DO UPDATE SET expires_at = $4`,
      [m.kind, m.key, m.linkId, m.expiresAt],
    );
  }

  async marked(kind: MarkKind, key: string, now: number) {
    const rows = await this.rows(
      'SELECT link_id FROM scout_marks WHERE kind = $1 AND key = $2 AND expires_at > $3 ORDER BY link_id',
      [kind, key, now],
    );
    return rows.map((r) => String(r.link_id));
  }

  async purge(now: number) {
    await this.rows('DELETE FROM scout_marks WHERE expires_at <= $1', [now]);
    await this.rows('DELETE FROM scout_installs WHERE expires_at <= $1', [now]);
    await this.rows('DELETE FROM scout_codes WHERE expires_at <= $1', [now]);
  }

  async close() {
    await this.pool.end();
  }
}

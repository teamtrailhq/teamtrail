import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RemoteToken, RemoteTokenView } from '../model/remoteToken';
import { OperationError } from '../planning/operations/operationError';
import { readRemoteTokens, readRemoteTokenUse, writeRemoteTokens, writeRemoteTokenUse } from './remoteTokenStore';

/** Every token starts with this, so one pasted in the wrong place is easy to recognise. */
export const REMOTE_TOKEN_PREFIX = 'tt_';
const MAX_TOKENS = 50;
const MAX_NAME = 60;
/** Last use is kept to the minute: one small write per token per minute at most. */
const USE_RESOLUTION_MS = 60_000;

const digest = (token: string) => createHash('sha256').update(token, 'utf8').digest();

/** The tokens as Settings lists them, oldest first, with when each was last used. */
export function remoteTokenViews(root: string): RemoteTokenView[] {
  const used = readRemoteTokenUse(root);
  return readRemoteTokens(root)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ id, name, createdAt }) => ({ id, name, createdAt, ...(used[id] ? { lastUsedAt: used[id] } : {}) }));
}

/**
 * A new token for one agent. The returned `token` is the only time its value exists outside the agent that gets
 * it: the file keeps its SHA-256.
 */
export function createRemoteToken(root: string, rawName: unknown, now = Date.now()) {
  const name = typeof rawName === 'string' ? rawName.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new OperationError('Name the agent this token is for.');
  if (name.length > MAX_NAME) throw new OperationError(`Keep the name under ${MAX_NAME} characters.`);
  const tokens = readRemoteTokens(root);
  if (tokens.some((t) => t.name.toLowerCase() === name.toLowerCase()))
    throw new OperationError(`A token named "${name}" already exists. One token per agent: pick another name.`);
  if (tokens.length >= MAX_TOKENS)
    throw new OperationError(`${MAX_TOKENS} tokens at most. Revoke one you no longer use.`);
  const token = `${REMOTE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const record: RemoteToken = {
    id: `rt_${randomBytes(6).toString('hex')}`,
    name,
    hash: digest(token).toString('hex'),
    createdAt: now,
  };
  writeRemoteTokens(root, [...tokens, record]);
  const view: RemoteTokenView = { id: record.id, name, createdAt: now };
  return { token, view };
}

/** Removes a token; the removed one, or undefined when the id is unknown. Its live sessions end within about a second. */
export function revokeRemoteToken(root: string, id: string): RemoteTokenView | undefined {
  const tokens = readRemoteTokens(root);
  const gone = tokens.find((t) => t.id === id);
  if (!gone) return undefined;
  writeRemoteTokens(
    root,
    tokens.filter((t) => t.id !== id),
  );
  const { [id]: _dropped, ...used } = readRemoteTokenUse(root);
  writeRemoteTokenUse(root, used);
  return { id: gone.id, name: gone.name, createdAt: gone.createdAt };
}

/**
 * The token record a presented token belongs to. Hashes are compared in constant time and every stored token is
 * compared, so neither a near miss nor the token's position shows in the timing.
 */
export function verifyRemoteToken(root: string, presented: string): RemoteToken | undefined {
  const tokens = readRemoteTokens(root);
  if (!tokens.length || !presented.startsWith(REMOTE_TOKEN_PREFIX) || presented.length > 200) return undefined;
  const given = digest(presented);
  let match: RemoteToken | undefined;
  for (const t of tokens) {
    const stored = Buffer.from(t.hash, 'hex');
    if (stored.length === given.length && timingSafeEqual(stored, given)) match = t;
  }
  return match;
}

/** Whether a token id is still live (not revoked). */
export const remoteTokenLive = (root: string, id: string) => readRemoteTokens(root).some((t) => t.id === id);

/** Notes that a token was used now, to the minute. */
export function touchRemoteToken(root: string, id: string, now = Date.now()) {
  const used = readRemoteTokenUse(root);
  if (now - (used[id] ?? 0) < USE_RESOLUTION_MS) return;
  const live = new Set(readRemoteTokens(root).map((t) => t.id));
  const kept = Object.fromEntries(Object.entries(used).filter(([k]) => live.has(k)));
  if (live.has(id)) writeRemoteTokenUse(root, { ...kept, [id]: now });
}

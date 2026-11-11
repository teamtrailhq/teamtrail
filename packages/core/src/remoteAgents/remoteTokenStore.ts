import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { RemoteToken } from '../model/remoteToken';

/*
 * Remote agents' tokens, on this machine only:
 *   <tracker dir>/.agents/remote-tokens.json        { v: 1, tokens: RemoteToken[] }   hashes, never the tokens
 *   <tracker dir>/.agents/remote-tokens-used.json   { v: 1, used: { <id>: <ms> } }    when each was last used
 * Git-ignored with the rest of `.agents/`, and never written to a tracker. The token file is written only by the
 * trail lead's actions (create, revoke); servers that check tokens write the second file, so a slow writer can
 * never bring a revoked token back.
 */
export const REMOTE_TOKENS_FILE = `${AGENTS_DIR}/remote-tokens.json`;
export const REMOTE_TOKENS_USED_FILE = `${AGENTS_DIR}/remote-tokens-used.json`;

const TOKEN_FIELDS: (keyof RemoteToken)[] = ['id', 'name', 'hash'];
const isToken = (t: Partial<RemoteToken> | null): t is RemoteToken =>
  !!t && TOKEN_FIELDS.every((k) => typeof t[k] === 'string' && t[k]) && typeof t.createdAt === 'number';

/** Keeps `.agents/` out of git even when this is the first file written there. */
const ignoreAgentsDir = (root: string) => ensureLocalDir(path.join(root, AGENTS_DIR));

/** The live tokens; none when the file is missing or unreadable, so a damaged file closes the endpoint. */
export function readRemoteTokens(root: string): RemoteToken[] {
  const raw = readJsonFile<{ v?: number; tokens?: unknown }>(path.join(root, REMOTE_TOKENS_FILE));
  if (raw?.v !== 1 || !Array.isArray(raw.tokens)) return [];
  return (raw.tokens as Partial<RemoteToken>[]).filter(isToken);
}

export function writeRemoteTokens(root: string, tokens: RemoteToken[]) {
  ignoreAgentsDir(root);
  writeJsonAtomic(path.join(root, REMOTE_TOKENS_FILE), { v: 1, tokens });
}

/** When each token was last used, by id. */
export function readRemoteTokenUse(root: string): Record<string, number> {
  const raw = readJsonFile<{ v?: number; used?: Record<string, number> }>(path.join(root, REMOTE_TOKENS_USED_FILE));
  return raw?.v === 1 && raw.used && typeof raw.used === 'object' ? raw.used : {};
}

export function writeRemoteTokenUse(root: string, used: Record<string, number>) {
  ignoreAgentsDir(root);
  writeJsonAtomic(path.join(root, REMOTE_TOKENS_USED_FILE), { v: 1, used });
}

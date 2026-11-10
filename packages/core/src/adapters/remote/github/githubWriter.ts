import { githubAccount, type Writer } from '../writer';
import type { GqlAuthored } from './schema';

/** Who is asking: the login behind the token, and which other logins can write to the repo (githubPermissions.ts). */
export interface GitHubReader {
  viewer: string | undefined;
  canWrite: (login: string) => boolean;
}

/** Authors GitHub says belong to the repo or its org: only these are worth asking about write access. */
const RELATED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** A collaborator with write access is a teammate; anyone else (read-only, org members without access) an outsider. */
function tierOf(r: GitHubReader, login: string | undefined): Writer {
  if (login && r.canWrite(login)) return { kind: 'teammate', ...githubAccount(login) };
  return login ? { kind: 'outsider', ...githubAccount(login) } : { kind: 'outsider', name: '' };
}

/** Asks nobody about write access: everyone is an outsider. */
const NOBODY: GitHubReader = { viewer: undefined, canWrite: () => false };

/** Everyone who saved a version, as far as GitHub says; undefined when it can't say for all (a long or broken history). */
function editorsOf(c: GqlAuthored): { login: string; at: string }[] | undefined {
  if (!c.lastEditedAt) return [];
  const edits = c.userContentEdits;
  if (!edits || edits.totalCount > edits.nodes.length) return undefined;
  if (edits.nodes.some((n) => !n.editor?.login)) return undefined;
  return edits.nodes.map((n) => ({ login: n.editor!.login, at: n.createdAt }));
}

/** The newest editor who isn't `viewer`, by the time of the edit (never by the order GitHub lists them in). */
const newestOther = (editors: { login: string; at: string }[], viewer: string | undefined) =>
  editors.filter((e) => !same(e.login, viewer)).sort((a, b) => b.at.localeCompare(a.at))[0]?.login;

/** This account wrote it and every version since: nobody else's word is in it. */
const allOurs = (author: string | undefined, editors: { login: string }[], viewer: string | undefined) =>
  same(author, viewer) && editors.every((e) => same(e.login, viewer));

/**
 * Who a comment's markers belong to. It is this machine's own only when the token's login wrote it and made every
 * edit since; a history GitHub can't fully name (too long, a deleted account) makes it nobody's. GitHub lets
 * people with write access edit anyone's comment, so one of ours someone else edited is the newest such editor's;
 * anyone else's comment is its author's, whoever touched it.
 */
export function commentWriter(r: GitHubReader, c: GqlAuthored): Writer {
  const author = c.author?.login;
  const editors = editorsOf(c);
  if (!editors) return tierOf(NOBODY, author);
  if (!same(author, r.viewer)) return tierOf(r, author);
  if (allOurs(author, editors, r.viewer)) return { kind: 'self', ...githubAccount(author!) };
  return tierOf(r, newestOther(editors, r.viewer));
}

/**
 * Who an issue body's meta marker belongs to. Ours only when this account wrote it and every version since.
 * Otherwise it is the newest other editor's (or the author's): Teamtrail rewrites the whole body on every claim
 * and status change, so a body we saved last still counts no higher than the people who wrote it before.
 */
export function bodyWriter(r: GitHubReader, c: GqlAuthored): Writer {
  const author = c.author?.login;
  const editors = editorsOf(c);
  if (!editors) return tierOf(NOBODY, author);
  if (allOurs(author, editors, r.viewer)) return { kind: 'self', ...githubAccount(author!) };
  const other = newestOther(editors, r.viewer);
  if (other) return tierOf(r, other);
  return same(author, r.viewer) ? tierOf(NOBODY, author) : tierOf(r, author);
}

/** Logins whose write access decides how their markers read: related authors and every editor, other than us. */
export function loginsToCheck(viewer: string | undefined, items: GqlAuthored[]): string[] {
  const out = new Set<string>();
  for (const c of items) {
    const author = c.author?.login;
    if (author && RELATED.has(c.authorAssociation ?? '')) out.add(author);
    for (const e of editorsOf(c) ?? []) out.add(e.login);
  }
  return [...out].filter((l) => !same(l, viewer)).sort();
}

import type { Writer } from '../writer';
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
  if (login && r.canWrite(login)) return { kind: 'teammate', name: login };
  return { kind: 'outsider', name: login ?? '' };
}

/** Edited, but by nobody GitHub can name (a deleted account shows as no one): nobody's markers count. */
const unverifiable = (c: GqlAuthored) => !!c.lastEditedAt && !c.editor?.login;

/**
 * Who a comment's markers belong to. A comment is this machine's own only when the token's login wrote it and
 * nobody else edited it since. GitHub lets people with write access edit anyone's comment, so one of ours that
 * someone else edited is that editor's; anyone else's comment is its author's, whoever touched it.
 */
export function commentWriter(r: GitHubReader, c: GqlAuthored): Writer {
  const author = c.author?.login;
  if (unverifiable(c)) return { kind: 'outsider', name: author ?? '' };
  if (!same(author, r.viewer)) return tierOf(r, author);
  const editor = c.lastEditedAt ? c.editor?.login : undefined;
  if (!editor || same(editor, author)) return { kind: 'self', name: author! };
  return tierOf(r, editor);
}

/**
 * Who an issue body's meta marker belongs to: whoever saved the body last, since Teamtrail rewrites the whole
 * body (text guarded, then its marker) on every claim and status change.
 */
export function bodyWriter(r: GitHubReader, c: GqlAuthored): Writer {
  if (unverifiable(c)) return { kind: 'outsider', name: c.author?.login ?? '' };
  const last = (c.lastEditedAt && c.editor?.login) || c.author?.login;
  if (same(last, r.viewer)) return { kind: 'self', name: last! };
  return tierOf(r, last);
}

/** Logins whose write access decides how their markers read: related authors and every editor, other than us. */
export function loginsToCheck(viewer: string | undefined, items: GqlAuthored[]): string[] {
  const out = new Set<string>();
  for (const c of items) {
    const author = c.author?.login;
    if (author && RELATED.has(c.authorAssociation ?? '')) out.add(author);
    if (c.editor?.login) out.add(c.editor.login);
  }
  return [...out].filter((l) => !same(l, viewer)).sort();
}

import type { Writer } from '../writer';
import type { GqlAuthored } from './schema';

/** How GitHub describes an author who belongs to the repo: its owner, a member of its organization, a collaborator. */
const TEAM = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

const tier = (login: string | undefined, c: GqlAuthored): Writer =>
  login && TEAM.has(c.authorAssociation ?? '')
    ? { kind: 'teammate', name: login }
    : { kind: 'outsider', name: login ?? '' };

/**
 * Who a comment's markers belong to. `viewer` is the login behind the token. A comment is this machine's own only
 * when that account wrote it and nobody else edited it since; GitHub lets people with write access edit anyone's
 * comment, so one of ours that someone else edited is that editor's, and one an outsider wrote stays an
 * outsider's whoever touched it.
 */
export function commentWriter(viewer: string | undefined, c: GqlAuthored): Writer {
  const author = c.author?.login;
  const editor = c.editor?.login;
  const byAuthor = !editor || same(editor, author);
  if (same(author, viewer)) return byAuthor ? { kind: 'self', name: author! } : { kind: 'teammate', name: editor! };
  return tier(author, c);
}

/**
 * Who an issue body's meta marker belongs to: whoever saved the body last, since Teamtrail rewrites the whole
 * body (text guarded, then its marker) on every claim and status change. Only the author and people with write
 * access can edit a body, so an editor who isn't the author is a teammate.
 */
export function bodyWriter(viewer: string | undefined, c: GqlAuthored): Writer {
  const author = c.author?.login;
  const last = c.editor?.login ?? author;
  if (same(last, viewer)) return { kind: 'self', name: last! };
  if (c.editor && !same(c.editor.login, author)) return { kind: 'teammate', name: c.editor.login };
  return tier(author, c);
}

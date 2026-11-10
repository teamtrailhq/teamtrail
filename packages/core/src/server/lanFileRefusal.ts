import { parseFront, type Front } from '../model/frontmatter';
import { HUMAN_ASSIGNEE, MAP_TRUST_KEYS, TICKET_TRUST_KEYS, TRUST_REFUSED } from './trustFields';

const MAP = /^[^/]+\/map\.md$/;
const TICKET = /^[^/]+\/tickets\/[^/]+\.md$/;

/** The trust keys of a trail's map or a ticket; undefined for any other file. */
function trustKeysOf(rel: string) {
  if (MAP.test(rel)) return MAP_TRUST_KEYS;
  if (TICKET.test(rel)) return TICKET_TRUST_KEYS;
  return undefined;
}

const same = (a: Front, b: Front, key: string) => JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null);

/** A trust key that differs between the two versions of the frontmatter; an assignee that became the human. */
function changedTrust(before: Front, after: Front, keys: string[]) {
  const key = keys.find((k) => !same(before, after, k));
  if (key) return key;
  const assignee = String(after.assignee ?? '');
  return !same(before, after, 'assignee') && HUMAN_ASSIGNEE.test(assignee) ? 'assignee' : undefined;
}

/**
 * Why a device on the network may not write this tracker file, or undefined when it may. The Lookout on a phone
 * keeps a markdown tracker in step through this route, so a trail's map and its tickets stay writable: their
 * text, comments, state and blockers. Their trust fields (trustFields.ts) must come through unchanged. Every
 * other file records the human's approval (decisions, a brief's status, confirmed criteria or knowledge) or
 * what agents run (guides), and has a route of its own that checks who asks.
 */
export function lanFileRefusal(rel: string, before: string | undefined, after: string): string | undefined {
  const keys = trustKeysOf(rel);
  if (!keys) return TRUST_REFUSED;
  const was = parseFront(before ?? '').front;
  const now = parseFront(after).front;
  return changedTrust(was, now, keys) ? TRUST_REFUSED : undefined;
}

import { parseMapFile } from '../adapters/markdown/mapFile';
import { parseFront, type Front } from '../model/frontmatter';
import { fieldsOfText } from '../signedState/itemCodec';
import { changedKeys } from '../signedState/stateFields';
import { stateItemOf } from '../signedState/stateItem';
import { HUMAN_ASSIGNEE, LAN_TICKET_FIELDS, MAP_TRUST_KEYS, TICKET_TRUST_KEYS, TRUST_REFUSED } from './trustFields';

const same = (a: Front, b: Front, key: string) => JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null);

/** A trust key that differs between the two versions of the frontmatter; an assignee that became the human. */
function changedTrust(before: Front, after: Front, keys: string[]) {
  const key = keys.find((k) => !same(before, after, k));
  if (key) return key;
  const assignee = String(after.assignee ?? '');
  return !same(before, after, 'assignee') && HUMAN_ASSIGNEE.test(assignee) ? 'assignee' : undefined;
}

/** Whether the gate fields that changed are all ones another device may change (only a ticket's progress). */
function gateFieldsAllowed(rel: string, before: string, after: string): boolean {
  const item = stateItemOf(rel);
  if (!item || item.kind === 'decision') return false;
  const was = fieldsOfText(item, before);
  const now = fieldsOfText(item, after);
  if (!was || !now) return false;
  const allowed = item.kind === 'ticket' ? LAN_TICKET_FIELDS : [];
  return changedKeys(was, now).every((k) => allowed.includes(k));
}

/** Whether a map's "Decisions so far" is the same in both: the Decisions view reads it (decisionAudit.ts). */
function sameDecisionsSoFar(mapId: string, before: string, after: string) {
  const of = (text: string) => JSON.stringify(parseMapFile(mapId, text).sections.decisions ?? []);
  return of(before) === of(after);
}

/**
 * Why a device on the network may not write this tracker file, or undefined when it may. The Lookout on a phone
 * keeps a markdown tracker in step through this route, so an existing trail's map and its tickets stay writable:
 * their text and comments (not a trail's Decisions so far), and a ticket's state, status and close (trustFields.ts `LAN_TICKET_FIELDS`). Every other
 * gate field, and the trust fields (trustFields.ts), must come through unchanged; a new trail or ticket can't be
 * written from there. Every other file records the human's approval (decisions, a brief's status, confirmed criteria
 * or knowledge) or what agents run (guides), and has a route of its own that checks who asks.
 */
export function lanFileRefusal(rel: string, before: string | undefined, after: string): string | undefined {
  const item = stateItemOf(rel);
  if (!item || item.kind === 'decision' || before === undefined) return TRUST_REFUSED;
  if (!gateFieldsAllowed(rel, before, after)) return TRUST_REFUSED;
  if (item.kind === 'map' && !sameDecisionsSoFar(item.mapId, before, after)) return TRUST_REFUSED;
  const keys = item.kind === 'map' ? MAP_TRUST_KEYS : TICKET_TRUST_KEYS;
  return changedTrust(parseFront(before).front, parseFront(after).front, keys) ? TRUST_REFUSED : undefined;
}

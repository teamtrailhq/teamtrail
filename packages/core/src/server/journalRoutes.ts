import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { TICKET_PHASES, type TransitionEntry } from '../model/lifecycle';
import { TRANSITIONS } from '../planning/lifecycle/transitions';
import { BadRequest, readJson, sendJson } from './http';

const EVENTS = new Set<string>(TRANSITIONS.map((r) => r.event));
const PHASES = new Set<string>(TICKET_PHASES);
const ACTORS = new Set(['agent', 'trail lead', 'engine']);
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 300;

function valid(e: Partial<TransitionEntry>): e is TransitionEntry {
  return (
    e.v === 1 &&
    e.kind === 'transition' &&
    typeof e.at === 'number' &&
    text(e.mapId) &&
    text(e.ticketId) &&
    text(e.ticketKey) &&
    text(e.actor) &&
    EVENTS.has(e.event ?? '') &&
    PHASES.has(e.from ?? '') &&
    PHASES.has(e.to ?? '') &&
    ACTORS.has(e.actorKind ?? '') &&
    (e.reason === undefined || typeof e.reason === 'string') &&
    (e.sessionId === undefined || text(e.sessionId))
  );
}

/**
 * Who an entry from the browser is by: the bridge says, never the body. The Lookout is the trail lead's (or, for
 * what follows from their action, the engine's); an agent never journals through it. From another device the
 * actor says so, so the history shows where an approval came from.
 */
function stamped(e: TransitionEntry, local: boolean): TransitionEntry | undefined {
  if (e.actorKind === 'agent') return undefined;
  const actor = e.actorKind === 'engine' ? 'engine' : 'trail lead';
  const { sessionId: _ignored, ...rest } = e;
  return { ...rest, actor: local ? actor : `${actor} (another device)` };
}

/** `/journal`: a trail's transition history (GET `?mapId=`), and appends from the browser (POST). */
export async function handleJournal(
  ctx: { root: string; local: boolean },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  const { root } = ctx;
  if (url.pathname !== '/journal') return false;
  const journal = journalFile(root);
  if (req.method === 'GET') {
    const mapId = url.searchParams.get('mapId');
    if (!mapId) throw new BadRequest('"mapId" is required');
    sendJson(res, 200, { entries: journal.read(mapId) });
    return true;
  }
  if (req.method === 'POST') {
    const e = await readJson<Partial<TransitionEntry>>(req, '{}');
    const entry = valid(e) ? stamped(e, ctx.local) : undefined;
    if (!entry) throw new BadRequest('not a transition entry from the Lookout');
    journal.append(entry);
    sendJson(res, 200, { ok: true });
    return true;
  }
  return false;
}

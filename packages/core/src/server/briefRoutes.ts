import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import { decided, EMPTY_SECTIONS, type DiscoveryBrief } from '../discovery/brief';
import { readBrief, writeBrief } from '../discovery/briefStore';
import { contentHash } from '../lib/contentHash';
import { seedFromBrief } from '../planning/assumptions/assumptionOps';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { matchesShown } from './shownContent';

const text = (v: unknown, max = 300) => typeof v === 'string' && v.length > 0 && v.length <= max;

/** A trail's id is a slug, an issue number or a tracker's uuid: it names a file here, so nothing else passes. */
const trailId = (v: unknown) => typeof v === 'string' && /^[\w.-]{1,200}$/.test(v) && !v.includes('..');

/**
 * `/briefs` routes over the discovery briefs under `root`; false when none matches.
 * GET `?mapId=` reads a trail's brief; POST `/briefs/accept` (`hash`: the one GET gave for the brief shown; 409 when it
 * changed since), `/briefs/request-changes` (`note`) are the trail lead's calls on a submitted brief; POST `/briefs/create` (`ticketId`) starts discovery for a trail created in the UI.
 * Accepting a brief adds its assumptions to the trail's Assumptions section (once).
 */
const DECISION_ROUTES: Record<string, 'accept' | 'request-changes' | undefined> = {
  '/briefs/accept': 'accept',
  '/briefs/request-changes': 'request-changes',
};

export async function handleBriefs(
  { root, active }: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (!url.pathname.startsWith('/briefs')) return false;
  if (url.pathname === '/briefs' && req.method === 'GET') {
    const mapId = url.searchParams.get('mapId');
    if (!trailId(mapId)) throw new BadRequest('"mapId" is required');
    const shown = readBrief(root, mapId!);
    sendJson(res, 200, { brief: shown ?? null, ...(shown ? { hash: contentHash(shown.sections) } : {}) });
    return true;
  }
  if (req.method !== 'POST') return false;
  const b = await readJson<{ mapId?: unknown; note?: unknown; ticketId?: unknown; hash?: unknown }>(req, '{}');
  if (!trailId(b.mapId)) throw new BadRequest('"mapId" is required');
  const mapId = b.mapId as string;
  const brief = readBrief(root, mapId);
  if (url.pathname === '/briefs/create') {
    if (brief) return (sendJson(res, 200, { brief }), true);
    // A brief belongs to a trail: no file is written for an id that isn't one.
    const trails = await (await active()).listMaps();
    if (!trails.some((m) => m.id === mapId)) return (sendJson(res, 404, { error: 'no such trail' }), true);
    const created = {
      mapId,
      status: 'draft' as const,
      ticketId: text(b.ticketId) ? (b.ticketId as string) : undefined,
      sections: { ...EMPTY_SECTIONS, assumptions: [], openQuestions: [] },
    };
    writeBrief(root, created);
    sendJson(res, 200, { brief: created });
    return true;
  }
  const kind = DECISION_ROUTES[url.pathname];
  if (!kind) return false;
  await decide({ root, active }, res, { kind, brief, body: b });
  return true;
}

/** The trail lead's accept (of the brief they were shown) or request for changes. */
async function decide(
  { root, active }: RouteContext,
  res: ServerResponse,
  at: { kind: 'accept' | 'request-changes'; brief?: DiscoveryBrief; body: { note?: unknown; hash?: unknown } },
) {
  const { kind, brief, body: b } = at;
  if (!brief) return sendJson(res, 404, { error: 'this trail has no discovery brief' });
  if (kind === 'accept' && !matchesShown(res, { given: b.hash, now: brief.sections, what: 'The brief' })) return;
  let next: DiscoveryBrief;
  try {
    next = decided(
      brief,
      kind === 'accept' ? { kind } : { kind, note: typeof b.note === 'string' ? b.note.slice(0, 2000) : '' },
    );
  } catch (e) {
    return sendJson(res, 409, { error: (e as Error).message });
  }
  writeBrief(root, next);
  const seeded = kind === 'accept' ? await seedAssumptions(await active(), next) : [];
  sendJson(res, 200, { brief: next, ...(seeded.length ? { assumptions: seeded } : {}) });
}

/**
 * The accepted brief's assumptions become the trail's. The brief is already accepted by then, so a failure here
 * (the tracker unreachable, say) is logged and the accept still succeeds; accepting again seeds what's missing.
 */
async function seedAssumptions(adapter: TrackerAdapter, brief: DiscoveryBrief) {
  try {
    return await seedFromBrief(adapter, brief);
  } catch (e) {
    console.error(`could not add the brief's assumptions to the trail: ${(e as Error).message}`);
    return [];
  }
}

import type { TrackerAdapter } from '../../adapters/adapter';
import { settingsFromKey, type BodySettings } from '../../adapters/remote/bodySettings';
import { reportsSettings } from '../../adapters/remote/settingsLedger';
import { trailGuidesByType } from '../../guides/trailGuidesByType';
import { VERIFICATION_LEVELS, type MapMetaPatch, type TicketMetaPatch } from '../../model/lifecycle';
import type { MapDoc, Ticket } from '../../model/types';
import { DEFAULT_CONFIG } from '../../verification/config';
import { readVerificationConfig } from '../../verification/configFile';
import { verificationFor } from '../../verification/policy';
import { effectiveTiers } from '../matching/tierOfTicket';
import { OperationError } from '../operations/operationError';

/** `as-is`: take the settings found in the tracker. `stricter`: the stricter of those and what applies here now. */
export type SettingsChoice = 'as-is' | 'stricter';

const rank = (v: BodySettings['verification']) => (v ? VERIFICATION_LEVELS.indexOf(v) : -1);
const stricterLevel = (a: BodySettings['verification'], b: BodySettings['verification']) =>
  rank(a) >= rank(b) ? a : b;
const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];
const both = (a: string[] = [], b: string[] = []) => a.filter((x) => b.includes(x));
const orNull = (ids: string[]) => (ids.length ? ids : null);

/** Per type, every guide either the found mapping or the one in force gives it: more guides is stricter. */
function joinedGuides(found: BodySettings, map: MapDoc) {
  const theirs = trailGuidesByType({ guidesByType: found.guidesByType, guides: found.guides }).byType;
  const ours = trailGuidesByType(map).byType;
  const types = Object.keys(ours);
  return Object.fromEntries(types.map((type) => [type, union(ours[type], theirs[type])]));
}

/** The ticket's patch: its own settings, as found or the stricter of found and in force (with the trail's level). */
function ticketPatch(o: { found: BodySettings; t: Ticket; map: MapDoc; root: string; choice: SettingsChoice }) {
  const { found, t } = o;
  if (o.choice === 'as-is')
    return {
      verification: found.verification ?? null,
      checks: found.checks ?? null,
      guide: found.guide ?? null,
      guidesAdded: found.guidesAdded ?? null,
      guidesRemoved: found.guidesRemoved ?? null,
    };
  const now = verificationFor(readVerificationConfig(o.root).config, o.map, t);
  const level = stricterLevel(found.verification, now.level);
  return {
    verification: level ?? null,
    checks: union(now.checks, found.checks),
    guide: found.guide ?? t.guide ?? null,
    guidesAdded: orNull(union(t.guidesAdded, found.guidesAdded)),
    guidesRemoved: orNull(both(t.guidesRemoved, found.guidesRemoved)),
  };
}

/** The trail's patch, the same way: its level against the project default, teams and model matching joined. */
function mapPatch(o: { found: BodySettings; map: MapDoc; root: string; choice: SettingsChoice }): MapMetaPatch {
  const { found, map } = o;
  if (o.choice === 'as-is')
    return {
      verification: found.verification ?? null,
      guides: found.guides ?? null,
      guidesByType: found.guidesByType ?? null,
      modelMatching: found.modelMatching ?? null,
    };
  const fallback = map.verification ?? (readVerificationConfig(o.root).config ?? DEFAULT_CONFIG).default;
  const guides = union(map.guides, found.guides);
  const matching = found.modelMatching ?? map.modelMatching;
  return {
    verification: stricterLevel(found.verification, fallback) ?? null,
    guides: guides.length ? guides : null,
    // either side's mapping with no team: the joined guides are the trail's own from now on
    guidesByType: found.guidesByType || map.guidesByType ? joinedGuides(found, map) : null,
    // per type, the stronger of the tier found and the default (tierOfTicket.ts), kept as the trail's own
    modelMatching: matching
      ? {
          enabled: !!(found.modelMatching?.enabled || map.modelMatching?.enabled),
          tiers: effectiveTiers({ modelMatching: matching, settingsUnconfirmed: true }),
        }
      : null,
  };
}

/**
 * The trail lead settles settings someone else wrote into the tracker: the ones found as they are, or the stricter
 * of those and what applies here now. Either way they are written with `confirm`, so they count as accepted on this
 * machine from then on, and the queue item goes. Trail lead only (the route is this machine's alone).
 */
export async function confirmTrackerSettings(
  adapter: TrackerAdapter,
  o: { root: string; mapId: string; issueId: string; choice: SettingsChoice },
) {
  if (!reportsSettings(adapter)) throw new OperationError('only a GitHub or Linear tracker keeps settings this way');
  const waiting = adapter.unacceptedSettings().find((u) => u.issueId === o.issueId);
  if (!waiting) throw new OperationError('nothing waits to be confirmed there');
  const found = settingsFromKey(waiting.waiting.found);
  const snap = await adapter.loadMap(o.mapId);
  if (o.issueId === o.mapId) {
    await adapter.setMapMeta(o.mapId, { ...mapPatch({ ...o, found, map: snap.map }), confirm: true });
    return;
  }
  const t = snap.tickets.find((x) => x.id === o.issueId);
  if (!t) throw new OperationError(`ticket ${o.issueId} not found`);
  const patch: TicketMetaPatch = { ...ticketPatch({ ...o, found, t, map: snap.map }), confirm: true };
  await adapter.setMeta(o.mapId, t.id, patch);
}

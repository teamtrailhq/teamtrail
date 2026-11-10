import { settingsChanges, settingsFromKey, settingsLines } from '../../adapters/remote/bodySettings';
import type { AttentionSource, Candidate } from '../types';

/** A short, stable tag for one set of settings, so dismissing a change doesn't hide the next one. */
function tag(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Settings someone else wrote into a tracked issue (a verification level, checks, a guide, model matching) that
 * this machine hasn't accepted. With settings accepted before, those stay in force until the human sets new ones
 * in the Lookout. With none (a new machine, a lost record), the stricter of the issue's and the project's apply
 * and completions wait, so it needs the human soon.
 */
export const trackerSettingsSource: AttentionSource = {
  kind: 'tracker-settings',
  collect({ trackerSettings = [], snaps }) {
    return trackerSettings.flatMap((u): Candidate[] => {
      const snap = snaps.find((s) => s.map.id === u.waiting.mapId);
      const ticket = snap?.tickets.find((t) => t.id === u.issueId);
      if (!snap || (!ticket && snap.map.id !== u.issueId)) return [];
      const found = settingsFromKey(u.waiting.found);
      const what = ticket ? ticket.key : 'this trail';
      const base = {
        kind: 'tracker-settings' as const,
        mapId: snap.map.id,
        ...(ticket ? { ticketId: ticket.id } : {}),
        since: u.waiting.at,
        urgency: 'soon' as const,
        ref: `${u.issueId}:${tag(u.waiting.found)}`,
      };
      if (u.inForce === undefined) {
        const holds = ticket ? [ticket.id] : snap.tickets.filter((t) => t.state === 'open').map((t) => t.id);
        const title = `Teamtrail doesn't know which settings you accepted for ${what}`;
        const using = "using the stricter of these and your project's until you choose";
        return [{ ...base, title, holds, notes: [using, ...settingsLines(found), 'completions wait for you'] }];
      }
      const changes = settingsChanges(settingsFromKey(u.inForce), found);
      if (!changes.length) return [];
      const title = `${u.waiting.by ?? 'Someone'} changed the settings of ${what} in the tracker`;
      return [{ ...base, title, holds: [], notes: [...changes, 'yours stay in force until you set them here'] }];
    });
  },
};

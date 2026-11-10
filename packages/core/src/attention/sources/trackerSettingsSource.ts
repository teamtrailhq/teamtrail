import { settingsChanges, settingsFromKey } from '../../adapters/remote/bodySettings';
import type { AttentionSource, Candidate } from '../types';

/** A short, stable tag for one set of settings, so dismissing a change doesn't hide the next one. */
function tag(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Settings someone else wrote into a tracked issue (a verification level, checks, a guide, model matching) that
 * this machine hasn't accepted. The ones in force stay until the human sets them in the Lookout; setting them
 * aside keeps the current ones.
 */
export const trackerSettingsSource: AttentionSource = {
  kind: 'tracker-settings',
  collect({ trackerSettings = [], snaps }) {
    return trackerSettings.flatMap((u): Candidate[] => {
      const snap = snaps.find((s) => s.map.id === u.waiting.mapId);
      const ticket = snap?.tickets.find((t) => t.id === u.issueId);
      if (!snap || (!ticket && snap.map.id !== u.issueId)) return [];
      const changes = settingsChanges(settingsFromKey(u.inForce), settingsFromKey(u.waiting.found));
      if (!changes.length) return [];
      const what = ticket ? ticket.key : 'the trail';
      const who = u.waiting.by ?? 'Someone';
      return [
        {
          kind: 'tracker-settings',
          mapId: snap.map.id,
          ...(ticket ? { ticketId: ticket.id } : {}),
          title: `${who} changed the settings of ${what} in the tracker`,
          since: u.waiting.at,
          urgency: 'fyi',
          ref: `${u.issueId}:${tag(u.waiting.found)}`,
          holds: [],
          notes: [...changes, 'yours stay in force until you set them here'],
        },
      ];
    });
  },
};

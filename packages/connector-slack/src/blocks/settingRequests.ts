import { ACTIONS, clip, label, md, lookoutButton, plain, quote } from './kit';

/** Button value: the trail, the request, and the hash of the request as the card shows it. */
export interface SettingRef {
  m: string;
  id: string;
  h: string;
}

/** What a setting request card shows: who asks to change which setting, why, on which trail. */
export interface SettingCard {
  mapId: string;
  id: string;
  hash: string;
  trail: string;
  /** "claude-01 asks to skip discovery" */
  ask: string;
  why: string;
}

const header = (c: SettingCard) => ['◆ *YOUR SETTING*', label(c.trail), label(clip(c.ask, 300))].join(' · ');

/**
 * An agent asks to change one of the trail lead's settings (skip discovery, the mode, the destination). Approving
 * is the Lookout's only (Slack's word passes Teamtrail's Scout service; core refuses it too, decideReroute.ts), so
 * the card offers Open in Lookout to approve, and Decline, owner-checked like every button.
 */
export function settingMessage(c: SettingCard, url?: string) {
  const ref = JSON.stringify({ m: c.mapId, id: c.id, h: c.hash } satisfies SettingRef);
  return {
    text: `Your setting · ${label(clip(c.ask, 140))}`,
    blocks: [
      { type: 'section', text: md(`${header(c)}\n${quote(clip(c.why, 2800))}`) },
      { type: 'context', elements: [md('Nothing changes until you approve it in the Lookout.')] },
      {
        type: 'actions',
        block_id: `setting:${c.mapId}:${c.id}`,
        elements: [
          ...lookoutButton(url),
          { type: 'button', action_id: ACTIONS.settingDecline, text: plain('Decline'), value: ref },
        ],
      },
    ],
  };
}

/** The card once decided: its header and one line (mrkdwn, already escaped) saying what happened. */
export function settingClosedMessage(c: SettingCard, line: string) {
  return {
    text: line,
    blocks: [
      { type: 'section', text: md(header(c).replace('◆ *YOUR SETTING*', '◇ *DECIDED*')) },
      { type: 'context', elements: [md(line)] },
    ],
  };
}

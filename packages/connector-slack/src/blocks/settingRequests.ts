import { ACTIONS, clip, label, md, openButton, plain, quote } from './kit';

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
 * An agent asks to change one of the trail lead's settings (skip discovery, the mode, the destination): Approve or
 * Decline, owner-checked like every button. Approving is bound to the request as shown here (`h`).
 */
export function settingMessage(c: SettingCard, url?: string) {
  const ref = JSON.stringify({ m: c.mapId, id: c.id, h: c.hash } satisfies SettingRef);
  return {
    text: `Your setting · ${label(clip(c.ask, 140))}`,
    blocks: [
      { type: 'section', text: md(`${header(c)}\n${quote(clip(c.why, 2800))}`) },
      { type: 'context', elements: [md('Nothing changes until you approve.')] },
      {
        type: 'actions',
        block_id: `setting:${c.mapId}:${c.id}`,
        elements: [
          { type: 'button', action_id: ACTIONS.settingApprove, style: 'primary', text: plain('Approve'), value: ref },
          { type: 'button', action_id: ACTIONS.settingDecline, text: plain('Decline'), value: ref },
          ...openButton(url),
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

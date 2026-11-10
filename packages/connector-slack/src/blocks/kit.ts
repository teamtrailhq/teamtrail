import { BRAND } from '@teamtrail/core';

export type Block = Record<string, unknown>;

export const plain = (text: string, emoji = true) => ({ type: 'plain_text', text, emoji });
/**
 * Slack mrkdwn. `verbatim` stops Slack from turning bare `@here`, `#channel` and URLs into mentions and links, so
 * only the `<…>` sequences this package writes itself are ones. Everything else goes through `escape` first.
 */
export const md = (text: string) => ({ type: 'mrkdwn', text, verbatim: true });
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/**
 * Text from an agent, the tracker or a person, made safe for any Slack text field: without `<`, `>` and `&`
 * nothing in it can become a mention (`<!channel>`, `<@U…>`), a channel link or a `<url|label>` link.
 */
export const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** `clip` for text that is already escaped: never leaves half an entity (`&l…`) at the cut. */
export const clipEscaped = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).replace(/&[a-z]*$/, '')}…` : s;
/** A user mention, only for something that is a Slack user id; anything else is shown as text. */
export const mention = (id: string) => (/^[UW][A-Z0-9]{2,}$/.test(id) ? `<@${id}>` : escape(id));
export const quote = (s: string) =>
  escape(s)
    .split('\n')
    .map((l) => `>${l}`)
    .join('\n');

export const ACTIONS = {
  claim: 'claim_owner',
  option: 'ask_option',
  reply: 'ask_reply',
  open: 'open_teamtrail',
  trailPick: 'trail_pick',
  approve: 'verify_approve',
  rework: 'verify_rework',
} as const;

export const VIEWS = {
  decision: 'decision_modal',
  reply: 'ask_reply_modal',
  rework: 'verify_rework_modal',
  ownerCode: 'owner_code_modal',
} as const;

export const openButton = (url: string | undefined): Block[] =>
  url ? [{ type: 'button', action_id: ACTIONS.open, text: plain(`Open in ${BRAND.name}`), url }] : [];

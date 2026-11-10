import { BRAND } from '@teamtrail/core';

export type Block = Record<string, unknown>;

export const plain = (text: string, emoji = true) => ({ type: 'plain_text', text, emoji });
/** Slack refuses a text object over 3000 characters, and with it the whole message. */
export const TEXT_LIMIT = 3000;
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/**
 * Text from an agent, the tracker or a person, made safe for any Slack text field: without `<`, `>` and `&`
 * nothing in it can become a mention (`<!channel>`, `<@U…>`), a channel link or a `<url|label>` link.
 */
export const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/**
 * `clip` for text that is already escaped mrkdwn: never leaves half an entity (`&l…`) or half of one of our own
 * `<…>` sequences at the cut.
 */
export const clipEscaped = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).replace(/(&[a-z]*|<[^>]*)$/, '')}…` : s;
/**
 * Slack mrkdwn, at most `TEXT_LIMIT` characters. `verbatim` stops Slack from turning bare `@here`, `#channel` and
 * URLs into mentions and links, so only the `<…>` sequences this package writes itself are ones. Everything else
 * goes through `escape` (or `label`) first, so the length is counted after escaping.
 */
export const md = (text: string) => ({ type: 'mrkdwn', text: clipEscaped(text, TEXT_LIMIT), verbatim: true });
/** One line: line and paragraph breaks (NEL, LS and PS included) and tabs become spaces. */
export const oneLine = (s: string) => s.replace(/[\r\n\t\v\f\u0085\u2028\u2029]+/g, ' ');
/**
 * Invisible characters that can reorder or hide text: every control (Cc) and format (Cf) character, such as bidi
 * overrides (U+202E), isolates, the zero-width space and the soft hyphen. ZWNJ (U+200C) and ZWJ (U+200D) stay,
 * because emoji sequences and scripts such as Persian and the Indic scripts need them to render.
 */
const INVISIBLE = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/gu;
/**
 * A name from an agent or the tracker (agent, trail, ticket, channel, person), for mrkdwn: one line, no invisible
 * characters, escaped, and with `*`, `~` and backticks swapped for look-alikes, so it can't start a line, a bold header or a code span of
 * its own. Underscores stay: names like `snake_case` are common, and italics fake nothing.
 */
export const label = (s: string) =>
  escape(oneLine(s).replace(INVISIBLE, '')).replace(/\*/g, '∗').replace(/~/g, '∼').replace(/`/g, 'ʼ');
/** A user mention, only for something that is a Slack user id; anything else is shown as text. */
export const mention = (id: string) => (/^[UW][A-Z0-9]{2,}$/.test(id) ? `<@${id}>` : label(id));
/** A quoted block; `md` keeps the whole within Slack's limit, counted after escaping. */
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

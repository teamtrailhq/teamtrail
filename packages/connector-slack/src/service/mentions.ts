import { label } from '../blocks';
import type { EnvelopeResult } from '../link/types';
import { inboxMessage, statusMessage } from './commands';
import { REFUSED } from './constants';
import type { SlackContext } from './slackContext';
import type { Payload } from './types';

/** Where Scout answers: in the mention's thread, or in the DM. */
interface Place {
  channel: string;
  thread?: string;
}

type Reply = { text: string; blocks?: unknown[] };

/** What @Scout and a DM to Scout understand; `/scout decide` needs a dialog, which a message can't open. */
export const mentionHelp = (command: string) =>
  [
    '*@Scout inbox*  questions waiting on you',
    '*@Scout status [trail]*  trip report',
    '*@Scout help*  this list',
    `To record a decision, use *${command} decide* or *Save as decision* on a message.`,
  ].join('\n');

/** The words after any `<@…>` mention, split into a command and its argument. */
function parse(text: unknown) {
  const words = String(text ?? '')
    .replace(/<@[A-Z0-9]+(\|[^>]*)?>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const [sub = '', ...rest] = words;
  return { sub: sub.toLowerCase(), arg: rest.join(' ').trim() };
}

async function replyFor(ctx: SlackContext, o: { sub: string; arg: string; command: string; dm: boolean }) {
  if (o.sub === 'inbox') return inboxMessage(ctx);
  if (o.sub === 'status') return statusMessage(ctx, o.arg, o.command);
  const help = mentionHelp(o.command);
  // In a DM anything else gets the help: people write "hi" to a bot.
  if (!o.sub || o.sub === 'help' || o.dm) return { text: help };
  return { text: `I don't know \`${label(o.sub)}\`.\n${help}` };
}

/** Where to answer this event, or undefined for events Scout doesn't answer (a bot, an edit, a channel message). */
function placeOf(ev: Payload): Place | undefined {
  if (ev.bot_id !== undefined || ev.subtype !== undefined || typeof ev.channel !== 'string') return undefined;
  if (ev.type === 'app_mention') return { channel: ev.channel, thread: String(ev.thread_ts ?? ev.ts) };
  if (ev.type === 'message' && ev.channel_type === 'im') return { channel: ev.channel };
  return undefined;
}

/**
 * @Scout in a channel, and a DM to Scout. The service passes these on only from the person who wrote them, to
 * their own Teamtrail; the same owner and allowed-user check as `/scout` applies. The answer is a plain post (no
 * answer buttons) in the mention's thread or the DM; anything a person typed comes back escaped.
 */
export function onMessage(ctx: SlackContext, ev: Payload): EnvelopeResult | void {
  const place = placeOf(ev);
  const user = typeof ev.user === 'string' ? ev.user : undefined;
  if (!place || !user) return;
  const post = (r: Reply) =>
    ctx.call('chat.postMessage', {
      channel: place.channel,
      ...(place.thread ? { thread_ts: place.thread } : {}),
      ...r,
    });
  if (!ctx.allowed(user)) return { after: async () => void (await post({ text: REFUSED })) };
  const command = ctx.store.read().command;
  const { sub, arg } = parse(ev.text);
  return {
    after: async () => {
      await post(await replyFor(ctx, { sub, arg, command, dm: !place.thread }));
    },
  };
}

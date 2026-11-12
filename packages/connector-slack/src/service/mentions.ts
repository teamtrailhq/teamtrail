import type { EnvelopeResult } from '../link/types';
import { inboxMessage, statusMessage } from './commands';
import { REFUSED } from './constants';
import { mentionCommand } from './mentionCommand';
import type { SlackContext } from './slackContext';
import type { Payload } from './types';

/**
 * Where Scout answers: in the mention's thread, or in the DM. `user` is who asked: in a channel, what's waiting on
 * them and their trails' state go to that person alone (an ephemeral reply), never to everyone who can read the
 * channel (guests, people from other workspaces, whoever joins later).
 */
interface Place {
  channel: string;
  thread?: string;
  user: string;
}

/** Inbox and status are private: in a channel they are shown to the asker only. */
const PRIVATE = new Set(['inbox', 'status']);

/** An ephemeral message can't be clicked through (Slack drops it), so it carries no buttons at all. */
const withoutButtons = (r: Reply): Reply =>
  r.blocks ? { ...r, blocks: r.blocks.filter((b) => (b as { type?: string }).type !== 'actions') } : r;

type Reply = { text: string; blocks?: unknown[] };

/** What @Scout and a DM to Scout understand; `/scout decide` needs a dialog, which a message can't open. */
export const mentionHelp = (command: string) =>
  [
    '*@Scout inbox*  questions waiting on you',
    '*@Scout status [trail]*  trip report',
    '*@Scout help*  this list',
    `To record a decision, use *${command} decide* or *Save as decision* on a message.`,
    'Scout answers from the Teamtrail of whoever mentions it: each person connects their own in Settings → Slack.',
    'Scout answers only while that Teamtrail is running on their computer.',
  ].join('\n');

async function replyFor(ctx: SlackContext, o: { sub: string; arg: string; command: string }) {
  if (o.sub === 'inbox') return inboxMessage(ctx);
  if (o.sub === 'status') return statusMessage(ctx, o.arg, o.command, { fallback: true });
  const help = mentionHelp(o.command);
  if (o.sub === 'help') return { text: help };
  // Anything else ("hi", a question Scout can't read) gets the help, pointing at the one most people want.
  return { text: `Try *@Scout inbox* for what's waiting on you.\n${help}` };
}

/** Where to answer this event, or undefined for events Scout doesn't answer (a bot, an edit, a channel message). */
function placeOf(ev: Payload): Place | undefined {
  if (ev.bot_id !== undefined || ev.subtype !== undefined || typeof ev.channel !== 'string') return undefined;
  if (typeof ev.user !== 'string') return undefined;
  if (ev.type === 'app_mention') return { channel: ev.channel, thread: String(ev.thread_ts ?? ev.ts), user: ev.user };
  if (ev.type === 'message' && ev.channel_type === 'im') return { channel: ev.channel, user: ev.user };
  return undefined;
}

/** Help and errors go in the thread or DM; inbox and status in a channel go to the asker alone. */
function poster(ctx: SlackContext, place: Place) {
  const thread = place.thread ? { thread_ts: place.thread } : {};
  return (r: Reply, o: { private: boolean }) => {
    if (o.private && place.thread)
      return ctx.call('chat.postEphemeral', {
        channel: place.channel,
        user: place.user,
        ...thread,
        ...withoutButtons(r),
      });
    return ctx.call('chat.postMessage', { channel: place.channel, ...thread, ...r });
  };
}

/**
 * @Scout in a channel, and a DM to Scout. The service passes these on only from the person who wrote them, to
 * their own Teamtrail (an allowed teammate without a connection of their own gets "not connected" from the
 * service); the same owner and allowed-user check as `/scout` applies. Inbox and status in a channel are shown to
 * the asker alone; help and errors are a plain post in the thread, and everything in a DM is. No answer buttons
 * anywhere; anything a person typed comes back escaped.
 */
export function onMessage(ctx: SlackContext, ev: Payload): EnvelopeResult | void {
  const place = placeOf(ev);
  if (!place) return;
  const post = poster(ctx, place);
  if (!ctx.allowed(place.user)) return { after: async () => void (await post({ text: REFUSED }, { private: false })) };
  const command = ctx.store.read().command;
  const { sub, arg } = mentionCommand(ev.text);
  return {
    after: async () => {
      const reply = await replyFor(ctx, { sub, arg, command });
      await post(reply, { private: PRIVATE.has(sub) });
    },
  };
}

import type { EnvelopeResult } from '../link/types';
import { inboxMessage, statusMessage } from './commands';
import { REFUSED } from './constants';
import { decisionsMessage } from './decisionsMessage';
import { mentionCommand } from './mentionCommand';
import type { SlackContext } from './slackContext';
import { ticketMessage } from './ticketMessage';
import type { Payload } from './types';
import { whoMessage } from './whoMessage';

/**
 * Where Scout answers: in the mention's thread, or in the DM. `user` is who asked: in a channel, what's waiting on
 * them and their trails' state go to that person alone (an ephemeral reply), never to everyone who can read the
 * channel (guests, people from other workspaces, whoever joins later).
 */
interface Place {
  channel: string;
  /** The thread public replies go in: the one the mention was in, or a new one under it. */
  thread?: string;
  /**
   * The thread the mention was written in, if any. A private (ephemeral) reply goes there, or else in the channel:
   * Slack shows an ephemeral reply in a thread only once that thread is opened, and a mention with no replies has
   * no thread to open, so it would never be seen.
   */
  inThread?: string;
  user: string;
}

/** Everything about the trails is private: in a channel it is shown to the asker only. Only help is public. */
const PRIVATE = new Set(['inbox', 'status', 'ticket', 'decisions', 'who']);

/** An ephemeral message can't be clicked through (Slack drops it), so it carries no buttons at all. */
const withoutButtons = (r: Reply): Reply =>
  r.blocks ? { ...r, blocks: r.blocks.filter((b) => (b as { type?: string }).type !== 'actions') } : r;

type Reply = { text: string; blocks?: unknown[] };

/** What @Scout and a DM to Scout understand; `/scout decide` needs a dialog, which a message can't open. */
export const mentionHelp = (command: string) =>
  [
    '*@Scout inbox*  questions waiting on you',
    '*@Scout status [trail]*  trip report',
    "*@Scout ticket #12*  a ticket's state, what blocks it and who's on it (no key: what's blocked)",
    '*@Scout decisions [trail or words]*  decisions in force, newest first',
    '*@Scout who*  agents working now',
    '*@Scout help*  this list',
    'Ask in your own words too: “what’s blocking #12?”, “what did we decide about retention?”.',
    `To record a decision, use *${command} decide* or *Save as decision* on a message.`,
    'Scout answers from the Teamtrail of whoever mentions it: each person connects their own in Settings → Slack.',
    'Scout answers only while that Teamtrail is running on their computer.',
  ].join('\n');

async function replyFor(ctx: SlackContext, o: { sub: string; arg: string; command: string }) {
  if (o.sub === 'inbox') return inboxMessage(ctx);
  if (o.sub === 'status') return statusMessage(ctx, o.arg, o.command, { fallback: true });
  if (o.sub === 'ticket') return ticketMessage(ctx, o.arg);
  if (o.sub === 'decisions') return decisionsMessage(ctx, o.arg);
  if (o.sub === 'who') return whoMessage(ctx);
  const help = mentionHelp(o.command);
  if (o.sub === 'help') return { text: help };
  // Anything else ("hi", a question Scout can't read) gets the help, pointing at the one most people want.
  return { text: `Try *@Scout inbox* for what's waiting on you.\n${help}` };
}

/** Where to answer this event, or undefined for events Scout doesn't answer (a bot, an edit, a channel message). */
function placeOf(ev: Payload): Place | undefined {
  if (ev.bot_id !== undefined || ev.subtype !== undefined || typeof ev.channel !== 'string') return undefined;
  if (typeof ev.user !== 'string') return undefined;
  if (ev.type === 'app_mention') {
    const inThread = ev.thread_ts === undefined ? undefined : String(ev.thread_ts);
    return { channel: ev.channel, thread: inThread ?? String(ev.ts), inThread, user: ev.user };
  }
  if (ev.type === 'message' && ev.channel_type === 'im') return { channel: ev.channel, user: ev.user };
  return undefined;
}

/** Help and errors go in the thread or DM; everything about the trails, in a channel, goes to the asker alone. */
function poster(ctx: SlackContext, place: Place) {
  const thread = place.thread ? { thread_ts: place.thread } : {};
  return (r: Reply, o: { private: boolean }) => {
    if (o.private && place.thread)
      return ctx.call('chat.postEphemeral', {
        channel: place.channel,
        user: place.user,
        ...(place.inThread ? { thread_ts: place.inThread } : {}),
        ...withoutButtons(r),
      });
    return ctx.call('chat.postMessage', { channel: place.channel, ...thread, ...r });
  };
}

/**
 * @Scout in a channel, and a DM to Scout. The service passes these on only from the person who wrote them, to
 * their own Teamtrail (an allowed teammate without a connection of their own gets "not connected" from the
 * service); the same owner and allowed-user check as `/scout` applies. Everything but help in a channel is shown to
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

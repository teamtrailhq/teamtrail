import { postResponse } from '../api';
import {
  ACTIONS,
  label,
  helpText,
  ownerCodeModal,
  replyModal,
  reworkModal,
  type ApprovalRef,
  type AskRef,
} from '../blocks';
import type { SettingRef } from '../blocks/settingRequests';
import { SAVE_DECISION_CALLBACK } from '../manifest';
import type { Envelope, EnvelopeResult } from '../socket';
import { plainText } from '../summary';
import { decideApproval, waitingApproval } from './approvals';
import { answer, pendingAsk } from './asks';
import { authentic } from './authentic';
import { inboxMessage, statusMessage } from './commands';
import { REFUSED, ALREADY } from './constants';
import { changeTrail, openDecision } from './decisionModal';
import { publishHome } from './owner';
import { activeCode } from './ownerCode';
import { decideSetting } from './settingRequests';
import type { SlackContext } from './slackContext';
import { onSubmit } from './submissions';
import type { Payload, DecisionMeta } from './types';

/**
 * Everything people do in Slack arrives here, over Socket Mode. Each handler below takes the acting user from the
 * payload Slack built (`user.id`, `user_id`), checks `ctx.allowed` before it reads or changes anything, and records
 * that same id as the author. Messages people write in channels and DMs are not subscribed to and do nothing.
 */
export async function onEnvelope(ctx: SlackContext, e: Envelope): Promise<EnvelopeResult | void> {
  if (!authentic(ctx, e)) return;
  const p = e.payload as Payload;
  if (e.type === 'events_api') {
    const ev = p.event as Payload | undefined;
    if (ev?.type === 'app_home_opened') return { after: () => publishHome(ctx, ev.user) };
    return;
  }
  if (e.type === 'slash_commands') return onCommand(ctx, p);
  if (p.type === 'message_action') return onShortcut(ctx, p);
  if (p.type === 'block_actions') return onAction(ctx, p);
  if (p.type === 'view_submission') return onSubmit(ctx, p);
}

export function onCommand(ctx: SlackContext, p: Payload): EnvelopeResult {
  const command = p.command as string;
  const [sub = '', ...rest] = String(p.text ?? '')
    .trim()
    .split(/\s+/);
  const arg = rest.join(' ').trim();
  const reply = (text: string) => ({ ack: { response_type: 'ephemeral', text } });
  if (!sub || sub === 'help') return reply(helpText(command));
  if (!ctx.allowed(p.user_id)) return reply(REFUSED);
  if (sub === 'decide') {
    const meta: DecisionMeta = { c: p.channel_id, cn: p.channel_name, u: p.user_id, w: p.team_id, r: p.response_url };
    return { after: () => openDecision(ctx, p.trigger_id, meta, arg) };
  }
  if (sub === 'status')
    return {
      after: async () =>
        postResponse(
          p.response_url,
          { response_type: 'ephemeral', ...(await statusMessage(ctx, arg, command)) },
          ctx.o.fetch,
        ),
    };
  if (sub === 'inbox')
    return {
      after: async () =>
        postResponse(p.response_url, { response_type: 'ephemeral', ...(await inboxMessage(ctx)) }, ctx.o.fetch),
    };
  return reply(`Unknown command \`${label(sub)}\`.\n${helpText(command)}`);
}

export function onShortcut(ctx: SlackContext, p: Payload): EnvelopeResult | void {
  if (p.callback_id !== SAVE_DECISION_CALLBACK) return;
  if (!ctx.allowed(p.user.id))
    return { after: () => postResponse(p.response_url, { response_type: 'ephemeral', text: REFUSED }, ctx.o.fetch) };
  const msg = p.message as Payload;
  const meta: DecisionMeta = {
    c: p.channel.id,
    cn: p.channel.name,
    t: msg.thread_ts ?? msg.ts,
    m: msg.ts,
    u: p.user.id,
    w: p.team.id,
  };
  return { after: () => openDecision(ctx, p.trigger_id, meta, plainText(String(msg.text ?? ''))) };
}

export function onAction(ctx: SlackContext, p: Payload): EnvelopeResult | void {
  const a = (p.actions as Payload[])[0];
  const id = String(a?.action_id ?? '');
  const user = p.user.id as string;
  if (id === ACTIONS.claim) return { after: () => enterCode(ctx, user, p.trigger_id) };
  if (id === ACTIONS.trailPick && p.view) {
    if (!ctx.allowed(user)) return;
    return { after: () => changeTrail(ctx, p.view, a.selected_option.value) };
  }
  if (id === ACTIONS.approve || id === ACTIONS.rework) return onApproval(ctx, p, id, String(a.value));
  if (id === ACTIONS.settingApprove || id === ACTIONS.settingDecline) return onSetting(ctx, p, id, String(a.value));
  if (id !== ACTIONS.reply && !id.startsWith(`${ACTIONS.option}:`)) return;
  const ephemeral = (text: string) =>
    postResponse(p.response_url, { response_type: 'ephemeral', replace_original: false, text }, ctx.o.fetch);
  if (!ctx.allowed(user)) return { after: () => ephemeral(REFUSED) };
  const ref = JSON.parse(a.value) as AskRef;
  return {
    after: async () => {
      const found = await pendingAsk(ctx, ref);
      if (!found) return ephemeral(ALREADY);
      if (id === ACTIONS.reply) {
        await ctx.call('views.open', {
          trigger_id: p.trigger_id,
          view: replyModal(found.view, JSON.stringify({ s: ref.s, q: ref.q })),
        });
        return;
      }
      const text = found.q.suggestions?.[ref.i ?? -1];
      if (text === undefined) return ephemeral(ALREADY);
      if (!(await answer(ctx, ref, text, user))) await ephemeral(ALREADY);
    },
  };
}

/**
 * "Enter code" on the Home tab. The modal opens only while the trail lead has a code waiting and nobody is put
 * forward yet; a click on a Home tab that is out of date just brings it up to date. Clicking claims nothing.
 */
async function enterCode(ctx: SlackContext, user: string, trigger: string) {
  const c = ctx.store.read();
  const open = !c.owners.length && !c.pendingOwner && !!activeCode(ctx);
  if (open) await ctx.call('views.open', { trigger_id: trigger, view: ownerCodeModal() });
  else await publishHome(ctx, user);
}

function onApproval(ctx: SlackContext, p: Payload, id: string, value: string): EnvelopeResult {
  const user = p.user.id as string;
  if (!ctx.allowed(user))
    return {
      after: () =>
        postResponse(
          p.response_url,
          { response_type: 'ephemeral', replace_original: false, text: REFUSED },
          ctx.o.fetch,
        ),
    };
  const ref = JSON.parse(value) as ApprovalRef;
  if (id === ACTIONS.approve)
    return { after: () => decideApproval(ctx, { ref, user, responseUrl: p.response_url }, { action: 'approve' }) };
  const meta = JSON.stringify({ ...ref, r: p.response_url });
  return {
    after: async () => {
      const item = await waitingApproval(ctx, ref, 'rework', p.response_url);
      if (item)
        await ctx.call('views.open', {
          trigger_id: p.trigger_id,
          view: reworkModal(`${item.ticketKey} ${item.title}`, meta),
        });
    },
  };
}

/** Approve or Decline on a setting request card: only the confirmed owner, like every other button. */
function onSetting(ctx: SlackContext, p: Payload, id: string, value: string): EnvelopeResult {
  const user = p.user.id as string;
  const ephemeral = (text: string) =>
    postResponse(p.response_url, { response_type: 'ephemeral', replace_original: false, text }, ctx.o.fetch);
  if (!ctx.allowed(user)) return { after: () => ephemeral(REFUSED) };
  const ref = JSON.parse(value) as SettingRef;
  const action = id === ACTIONS.settingApprove ? 'approve' : 'decline';
  return { after: () => decideSetting(ctx, { ref, user, responseUrl: p.response_url }, action) };
}

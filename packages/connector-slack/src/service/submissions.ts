import { ACTIONS, VIEWS, type ApprovalRef, type AskRef, type SaveMode } from '../blocks';
import type { EnvelopeResult } from '../link/types';
import { closeAsk, writeAnswer } from './asks';
import { ALREADY, REFUSED } from './constants';
import { decideApproval } from './decideApproval';
import { saveDecision } from './saveDecision';
import type { SlackContext } from './slackContext';
import type { DecisionMeta, Payload } from './types';

type Values = Record<string, Record<string, Payload>>;
type Submitted = { view: Payload; values: Values; user: string };

/** A modal field's error, shown under that field. */
const fieldError = (field: string, message: string): EnvelopeResult => ({
  ack: { response_action: 'errors', errors: { [field]: message } },
});
const textOf = (values: Values, block: string) => String(values[block]?.value?.value ?? '').trim();

/** A submitted modal. `user` is who Slack says pressed Submit; every modal checks it may act. */
export function onSubmit(ctx: SlackContext, p: Payload): EnvelopeResult | void {
  const view = p.view as Payload;
  const values = (view.state?.values ?? {}) as Values;
  const s: Submitted = { view, values, user: p.user.id as string };
  if (view.callback_id === VIEWS.rework) return submitRework(ctx, s);
  if (view.callback_id === VIEWS.reply) return submitReply(ctx, s);
  if (view.callback_id === VIEWS.decision) return submitDecision(ctx, s);
}

function submitRework(ctx: SlackContext, { view, values, user }: Submitted): EnvelopeResult {
  if (!ctx.allowed(user)) return fieldError('reason', REFUSED);
  const meta = JSON.parse(view.private_metadata) as ApprovalRef & { r?: string };
  const reason = textOf(values, 'reason');
  if (!reason) return fieldError('reason', 'Say what has to change');
  return { after: () => decideApproval(ctx, { ref: meta, user, responseUrl: meta.r }, { action: 'rework', reason }) };
}

function submitReply(ctx: SlackContext, { view, values, user }: Submitted): EnvelopeResult {
  if (!ctx.allowed(user)) return fieldError('answer', REFUSED);
  const ref = JSON.parse(view.private_metadata) as AskRef;
  const text = textOf(values, 'answer');
  if (!text) return fieldError('answer', 'Enter an answer');
  const ok = writeAnswer(ctx, ref, text, user);
  if (!ok) return fieldError('answer', ALREADY);
  return { after: () => closeAsk(ctx, ref.q) };
}

function submitDecision(ctx: SlackContext, { view, values, user }: Submitted): EnvelopeResult {
  if (!ctx.allowed(user)) return fieldError('decision', REFUSED);
  const meta = JSON.parse(view.private_metadata) as DecisionMeta;
  const decision = textOf(values, 'decision');
  if (!decision) return fieldError('decision', 'Enter the decision');
  const picked = (block: string, action = 'value') =>
    values[block]?.[action]?.selected_option?.value as string | undefined;
  const mode = (picked('mode') ?? 'trail') as SaveMode;
  const ticketId = picked('ticket');
  if (mode === 'resolve' && !ticketId) return fieldError('ticket', 'Pick the ticket to resolve');
  const mapId = meta.mid ?? picked('trail', ACTIONS.trailPick);
  if (!mapId) return fieldError('decision', 'Pick a trail');
  const summary = textOf(values, 'summary');
  return { after: () => saveDecision(ctx, { meta, user, mapId, mode, ticketId, decision, summary }) };
}

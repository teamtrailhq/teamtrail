import type { Envelope } from '@teamtrail/connector-slack/node';

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : undefined;

const RESPONSE_ACTIONS = new Set(['errors', 'update', 'push', 'clear']);

/** A reply to a command: shown to the person who typed it only, never posted in the channel, never replacing. */
function commandAck(ack: Obj) {
  const reply: Obj = { response_type: 'ephemeral' };
  if (typeof ack.text === 'string') reply.text = ack.text;
  if (Array.isArray(ack.blocks)) reply.blocks = ack.blocks;
  return reply.text === undefined && reply.blocks === undefined ? undefined : reply;
}

/** A reply to a modal submission: one of Slack's response actions, nothing else. */
function submissionAck(ack: Obj) {
  if (typeof ack.response_action !== 'string' || !RESPONSE_ACTIONS.has(ack.response_action)) return undefined;
  const reply: Obj = { response_action: ack.response_action };
  if (ack.errors !== undefined) reply.errors = ack.errors;
  if (ack.view !== undefined) reply.view = ack.view;
  return reply;
}

/**
 * What a linked Teamtrail's ack may say to Slack. Slack posts a command's ack as a message, so an `in_channel`
 * ack would be an unrecorded Scout message anyone could click; acks are kept to ephemeral command replies and
 * modal response actions. Everything else Slack ignores, so nothing else is passed on.
 */
export function safeAck(envelope: Envelope, raw: unknown): unknown {
  const ack = obj(raw);
  if (!ack) return undefined;
  if (envelope.type === 'slash_commands') return commandAck(ack);
  const submission = envelope.type === 'interactive' && envelope.payload.type === 'view_submission';
  return submission ? submissionAck(ack) : undefined;
}

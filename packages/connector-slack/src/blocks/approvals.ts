import type { ApprovalItem } from '@teamtrail/core';
import { ACTIONS, VIEWS, answerBlocks, clip, label, md, plain, quote, type AnswerMode } from './kit';

/** Button and modal value: trail, ticket and the attempt the approval is about. */
export interface ApprovalRef {
  m: string;
  t: string;
  a?: string;
}

const header = (trail: string, i: ApprovalItem) =>
  [i.kind === 'approve' ? '◆ *APPROVE*' : '⛔ *HELD*', label(trail), `${label(i.ticketKey)} ${label(i.title)}`].join(
    ' · ',
  );

/**
 * A ticket waiting on the trail lead: Approve (reviewed passes only), Rework…, Open. A completion that touched
 * high-risk files (`mode: 'lookout'`) is approved only in the Lookout.
 */
export function approvalMessage(trail: string, i: ApprovalItem, url?: string, mode?: AnswerMode) {
  const ref = JSON.stringify({
    m: i.mapId,
    t: i.ticketId,
    ...(i.attemptId ? { a: i.attemptId } : {}),
  } satisfies ApprovalRef);
  return {
    text: `${i.kind === 'approve' ? 'Approve' : 'Held'} · ${label(i.ticketKey)} ${label(clip(i.title, 120))}`,
    blocks: [
      { type: 'section', text: md(`${header(trail, i)}\n${quote(clip(i.reason, 2800))}`) },
      ...answerBlocks({
        mode,
        blockId: `approval:${i.mapId}:${i.ticketId}`,
        buttons: [
          ...(i.kind === 'approve'
            ? [{ type: 'button', action_id: ACTIONS.approve, style: 'primary', text: plain('Approve'), value: ref }]
            : []),
          { type: 'button', action_id: ACTIONS.rework, text: plain('Rework…'), value: ref },
        ],
        url,
      }),
    ],
  };
}

/** The message once the ticket stopped waiting: the header and one line (mrkdwn, already escaped) saying what happened. */
export function approvalClosedMessage(trail: string, i: ApprovalItem, line: string) {
  return {
    text: line,
    blocks: [
      { type: 'section', text: md(header(trail, i).replace(/^(◆|⛔) \*[A-Z]+\*/, '◇ *DECIDED*')) },
      { type: 'context', elements: [md(line)] },
    ],
  };
}

export function reworkModal(ticket: string, meta: string) {
  return {
    type: 'modal',
    callback_id: VIEWS.rework,
    private_metadata: meta,
    title: plain('Send back to rework'),
    submit: plain('Send back'),
    close: plain('Cancel'),
    blocks: [
      { type: 'context', elements: [md(label(ticket))] },
      {
        type: 'input',
        block_id: 'reason',
        label: plain('What has to change'),
        element: { type: 'plain_text_input', action_id: 'value', multiline: true },
      },
    ],
  };
}

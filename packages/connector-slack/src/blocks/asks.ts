import { ACTIONS, VIEWS, clip, escape, md, openButton, plain, quote } from './kit';

export interface AskView {
  sessionId: string;
  questionId: string;
  text: string;
  suggestions?: string[];
  agent: string;
  trail?: string;
  ticket?: string;
}

export interface AskRef {
  s: string;
  q: string;
  i?: number;
}

const askHeader = (a: AskView) =>
  ['◆ *AWAITING YOU*', a.trail && escape(a.trail), a.ticket && escape(a.ticket), escape(a.agent)]
    .filter(Boolean)
    .join(' · ');

export function askMessage(a: AskView, o: { url?: string; detail?: 'full' | 'titles-only' } = {}) {
  const ref = (i?: number) =>
    JSON.stringify({ s: a.sessionId, q: a.questionId, ...(i === undefined ? {} : { i }) } satisfies AskRef);
  const body = o.detail === 'titles-only' ? askHeader(a) : `${askHeader(a)}\n${quote(clip(a.text, 2800))}`;
  const options = (a.suggestions ?? [])
    .slice(0, 4)
    .map((s, i) => ({ type: 'button', action_id: `${ACTIONS.option}:${i}`, text: plain(clip(s, 75)), value: ref(i) }));
  return {
    text: `Awaiting you · ${escape(a.agent)}: ${escape(clip(a.text, 140))}`,
    blocks: [
      { type: 'section', text: md(body) },
      {
        type: 'actions',
        block_id: `ask:${a.questionId}`,
        elements: [
          ...options,
          { type: 'button', action_id: ACTIONS.reply, text: plain('Reply…'), value: ref() },
          ...openButton(o.url),
        ],
      },
    ],
  };
}

export function askClosedMessage(
  a: AskView,
  line: string,
  o: { detail?: 'full' | 'titles-only'; answered?: boolean } = {},
) {
  const head = askHeader(a).replace('◆ *AWAITING YOU*', o.answered === false ? '◇ *CLOSED*' : '◇ *ANSWERED*');
  const body = o.detail === 'titles-only' ? head : `${head}\n${quote(clip(a.text, 2800))}`;
  return {
    text: line,
    blocks: [
      { type: 'section', text: md(body) },
      { type: 'context', elements: [md(line)] },
    ],
  };
}

export function replyModal(a: AskView, meta: string) {
  return {
    type: 'modal',
    callback_id: VIEWS.reply,
    private_metadata: meta,
    title: plain('Reply'),
    submit: plain('Send'),
    close: plain('Cancel'),
    blocks: [
      { type: 'context', elements: [md(`${escape(a.agent)}${a.ticket ? ` · ${escape(a.ticket)}` : ''}`)] },
      { type: 'section', text: md(quote(clip(a.text, 2800))) },
      {
        type: 'input',
        block_id: 'answer',
        label: plain('Answer'),
        element: { type: 'plain_text_input', action_id: 'value', multiline: true },
      },
    ],
  };
}

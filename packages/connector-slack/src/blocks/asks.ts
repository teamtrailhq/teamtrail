import { questionHeadline } from '@teamtrail/core';
import { ACTIONS, VIEWS, answerBlocks, clip, label, md, openButton, plain, quote, type AnswerMode } from './kit';

export interface AskView {
  sessionId: string;
  questionId: string;
  text: string;
  /** The agent's one-line headline, when it gave one; else the card leads with the question's first sentence. */
  summary?: string;
  suggestions?: string[];
  agent: string;
  trail?: string;
  ticket?: string;
  /** What answering it lets the agent do ("Answering this decides #3"), so a one-click reply is no surprise. */
  stakes?: string;
  /** An earlier decision that may already answer it: "D-2 already decided: …". */
  precedent?: string;
}

export interface AskRef {
  s: string;
  q: string;
  i?: number;
}

const askHeader = (a: AskView) =>
  ['◆ *AWAITING YOU*', a.trail && label(a.trail), a.ticket && label(a.ticket), label(a.agent)]
    .filter(Boolean)
    .join(' · ');

/** The line saying what answering decides, as quiet context above the buttons. */
const stakesBlock = (a: AskView) => [
  ...(a.stakes ? [{ type: 'context', elements: [md(`*${label(clip(a.stakes, 280))}*`)] }] : []),
  ...(a.precedent ? [{ type: 'context', elements: [md(label(clip(a.precedent, 280)))] }] : []),
];

/**
 * The question as the card shows it: its headline in bold, then the question in full as a quote (its line breaks
 * kept), unless the headline says it all. Records stored before headlines existed read the same way.
 */
function askBody(a: AskView) {
  const headline = questionHeadline(a);
  const title = `*${label(headline.text)}*`;
  return headline.whole ? title : `${title}\n${quote(clip(a.text, 2600))}`;
}

export function askMessage(a: AskView, o: { url?: string; detail?: 'full' | 'titles-only'; mode?: AnswerMode } = {}) {
  const ref = (i?: number) =>
    JSON.stringify({ s: a.sessionId, q: a.questionId, ...(i === undefined ? {} : { i }) } satisfies AskRef);
  const body = o.detail === 'titles-only' ? askHeader(a) : `${askHeader(a)}\n${askBody(a)}`;
  const options = (a.suggestions ?? [])
    .slice(0, 4)
    .map((s, i) => ({ type: 'button', action_id: `${ACTIONS.option}:${i}`, text: plain(clip(s, 75)), value: ref(i) }));
  return {
    text: `Awaiting you · ${label(a.agent)}: ${label(questionHeadline(a).text)}`,
    blocks: [
      { type: 'section', text: md(body) },
      ...stakesBlock(a),
      ...answerBlocks({
        mode: o.mode,
        blockId: `ask:${a.questionId}`,
        buttons: [...options, { type: 'button', action_id: ACTIONS.reply, text: plain('Reply…'), value: ref() }],
        url: o.url,
      }),
    ],
  };
}

export function askClosedMessage(
  a: AskView,
  line: string,
  o: { detail?: 'full' | 'titles-only'; answered?: boolean; url?: string } = {},
) {
  const head = askHeader(a).replace('◆ *AWAITING YOU*', o.answered === false ? '◇ *CLOSED*' : '◇ *ANSWERED*');
  const body = o.detail === 'titles-only' ? head : `${head}\n${askBody(a)}`;
  return {
    text: line,
    blocks: [
      { type: 'section', text: md(body) },
      { type: 'context', elements: [md(line)] },
      ...(o.url ? [{ type: 'actions', block_id: `ask:${a.questionId}`, elements: openButton(o.url) }] : []),
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
      { type: 'context', elements: [md(`${label(a.agent)}${a.ticket ? ` · ${label(a.ticket)}` : ''}`)] },
      { type: 'section', text: md(askBody(a)) },
      {
        type: 'input',
        block_id: 'answer',
        label: plain('Answer'),
        element: { type: 'plain_text_input', action_id: 'value', multiline: true },
      },
    ],
  };
}

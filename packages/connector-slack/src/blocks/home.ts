import { BRAND } from '@teamtrail/core';
import { ACTIONS, VIEWS, md, mention, openButton, plain } from './kit';

/**
 * What a member sees on the Home tab:
 * - `idle`: nobody is confirmed and no code is waiting. Nothing to click.
 * - `code`: the trail lead asked for a one-time code in the Lookout; whoever has it can enter it.
 * - `confirm`: this account entered the code and waits for the trail lead to confirm it in the Lookout.
 * - `yours` / `connected`: an owner is confirmed, and it is this member or someone else.
 */
export type HomeState =
  | { kind: 'idle' }
  | { kind: 'code' }
  | { kind: 'confirm' }
  | { kind: 'yours'; owner: string }
  | { kind: 'connected'; owner: string };

const WHERE = `${BRAND.name} → Settings → Slack`;

function lead(s: HomeState): string {
  switch (s.kind) {
    case 'idle':
      return `*${BRAND.assistant.name}* isn't connected to anyone yet. Whoever runs ${BRAND.name} finishes the setup on their computer, in ${WHERE}.`;
    case 'code':
      return `*${BRAND.assistant.name}* is almost connected. If you are setting up ${BRAND.name} on your computer, enter the code shown in ${WHERE}.`;
    case 'confirm':
      return `Almost there. On your computer, open ${WHERE} and confirm that this is your Slack account. Nothing is sent here until you do.`;
    case 'yours':
      return 'Connected. Decisions and questions reach you here.';
    case 'connected':
      return `Connected to ${BRAND.name} for ${mention(s.owner)}.`;
    default:
      return s satisfies never;
  }
}

export function homeView(s: HomeState, o: { url?: string; command: string }) {
  const runs = { type: 'context', elements: [md(`Runs while ${BRAND.name} is open on your computer.`)] };
  const intro = { type: 'section', text: md(lead(s)) };
  if (s.kind === 'code')
    return {
      type: 'home',
      blocks: [
        intro,
        {
          type: 'actions',
          elements: [{ type: 'button', action_id: ACTIONS.claim, style: 'primary', text: plain('Enter code') }],
        },
        runs,
      ],
    };
  if (s.kind === 'idle' || s.kind === 'confirm') return { type: 'home', blocks: [intro, runs] };
  return {
    type: 'home',
    blocks: [
      intro,
      {
        type: 'section',
        text: md(
          `\`${o.command} decide\`, \`${o.command} status\`, \`${o.command} inbox\`, and *Save as decision* on any message.`,
        ),
      },
      ...(o.url ? [{ type: 'actions', elements: openButton(o.url) }] : []),
      runs,
    ],
  };
}

/** The modal the Home tab's "Enter code" opens: the one-time code from the Lookout. */
export function ownerCodeModal() {
  return {
    type: 'modal',
    callback_id: VIEWS.ownerCode,
    title: plain(`Connect ${BRAND.name}`),
    submit: plain('Continue'),
    close: plain('Cancel'),
    blocks: [
      {
        type: 'input',
        block_id: 'code',
        label: plain(`Code from ${WHERE}`),
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          max_length: 20,
          placeholder: plain('XXXX-XXXX'),
        },
      },
      {
        type: 'context',
        elements: [md(`After this, confirm your Slack account in ${BRAND.name} on your computer.`)],
      },
    ],
  };
}

export const helpText = (command: string) =>
  [
    `*${command} decide [text]*  record a decision (or use *Save as decision* on a message)`,
    `*${command} status [trail]*  trip report`,
    `*${command} inbox*  questions waiting on you`,
    `*${command} help*  this list`,
  ].join('\n');

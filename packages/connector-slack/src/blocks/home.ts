import { BRAND } from '@teamtrail/core';
import { md, mention, openButton } from './kit';

/**
 * What a member sees on the Home tab of the Teamtrail it reached:
 * - `idle`: this Teamtrail has no owner (it is being set up again). Nothing to click.
 * - `yours` / `connected`: Scout is connected for this member or for someone else.
 */
export type HomeState = { kind: 'idle' } | { kind: 'yours'; owner: string } | { kind: 'connected'; owner: string };

const WHERE = `${BRAND.name} → Settings → Slack`;

function lead(s: HomeState): string {
  switch (s.kind) {
    case 'idle':
      return `*${BRAND.assistant.name}* isn't connected to anyone here yet. Choose Add Scout to Slack in ${WHERE} on your computer.`;
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
  if (s.kind === 'idle') return { type: 'home', blocks: [intro, runs] };
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

export const helpText = (command: string) =>
  [
    `*${command} decide [text]*  record a decision (or use *Save as decision* on a message)`,
    `*${command} status [trail]*  trip report`,
    `*${command} inbox*  questions waiting on you`,
    `*${command} help*  this list`,
  ].join('\n');

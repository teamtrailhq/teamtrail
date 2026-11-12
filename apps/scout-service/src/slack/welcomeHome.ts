import type { Unreachable } from './offlineReply';
import { UNREACHABLE_TEXT } from './unreachableText';

const DOCS = 'https://teamtrail.app/docs/slack/';

const mrkdwn = (text: string) => ({ type: 'mrkdwn', text, verbatim: true });
const section = (text: string) => ({ type: 'section', text: mrkdwn(text) });

const STEPS = [
  '1. In your project, run `npx teamtrail@next`. It opens the Lookout in your browser.',
  '2. In the Lookout, open *Settings → Slack* and choose *Add Scout to Slack*.',
  '3. Keep Teamtrail running: Scout answers only while it runs on your computer.',
].join('\n');

/**
 * The Home tab when Scout can't reach the person's Teamtrail: what Scout is, why it has nothing to show, and how
 * to get there. Only fixed text of ours, nothing from a request.
 */
export function welcomeHome(why: Unreachable) {
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Scout, the voice of Teamtrail' } },
      section(
        "Scout brings your coding agents' questions, approvals and trail summaries into Slack. It works with Teamtrail running on your own computer: your trails and decisions stay there.",
      ),
      section(`*Right now:* ${UNREACHABLE_TEXT[why]}`),
      { type: 'divider' },
      section(`*Get started*\n${STEPS}`),
      { type: 'context', elements: [mrkdwn(`<${DOCS}|How Scout and Teamtrail work together>`)] },
    ],
  };
}

/**
 * Re-records the fixtures:  node packages/connector-slack/test/run.mjs record
 * Flows run against test/fakes (deterministic; no network, no tokens). Each
 * fixture keeps the Web API exchanges the Scout service makes for this
 * Teamtrail (method, path, body; never headers with tokens) and the envelopes
 * with the acks Scout sent back.
 */
import { freezeTime, world } from './harness';
import { approvalFlow, approvalRestartFlow, askFlow, decisionFlow, notifyFlow, statusFlow } from './scenarios';

const NOTE =
  'Recorded against test/fakes/slack.ts through test/fakes/scoutHub.ts; request and response shapes follow api.slack.com (Web API methods, interaction payloads, Block Kit).';

const flows: [string, (w: ReturnType<typeof world>) => Promise<unknown>, string][] = [
  [
    'slack-ask.json',
    askFlow,
    'Agent questions as DMs: refused click, button answer, late click, answer in the Lookout, Reply… modal, agent gone.',
  ],
  [
    'slack-decision.json',
    decisionFlow,
    'Save as decision on a thread (refused, modal, trail switch, validation, save), bot not in channel, /scout decide as trail only.',
  ],
  ['slack-status.json', statusFlow, '/scout help, status (all and one trail), inbox, unknown subcommand, refusal.'],
  [
    'slack-notify.json',
    notifyFlow,
    'Blocked and trail-done notifications in the owner DM, threaded per trail per day.',
  ],
  [
    'slack-approvals.json',
    approvalFlow,
    'A reviewed pass to approve and a held ticket in the owner DM: refused click, Approve, Rework… modal with a reason.',
  ],
  [
    'slack-approvals-restart.json',
    approvalRestartFlow,
    'Restart with approvals waiting: stored messages updated in place, an approved one closed with its outcome, stale Approve and Rework… refused.',
  ],
];

const thaw = freezeTime();
try {
  for (const [name, flow, notes] of flows) {
    const w = world('record', name);
    try {
      await flow(w);
      w.save(`${NOTE} ${notes}`);
    } finally {
      w.cleanup();
    }
  }
} finally {
  thaw();
}
console.log('recorded slack fixtures');

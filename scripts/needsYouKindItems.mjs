// The Needs you items the dev seed doesn't make, worded as their sources in packages/core/src/attention/sources/ word
// them, on the seed's tickets (verifyNeedsYouKinds.mjs). Long on purpose: a phone row has to hold the longest.

/** The kinds the dev seed makes on its own (scripts/seed-dev.ts and its parts). */
export const SEEDED_KINDS = [
  'brief',
  'criteria',
  'reroute',
  'trust',
  'hitl-ready',
  'model',
  'policy',
  'overlap',
  'guide',
  'guide-checks',
  'knowledge',
];

const MAIN = 'offline-first-sync-for-fieldnote';
const OTHER = 'team-workspaces';

/** One item as `buildAttention` hands it out: its id from kind, trail and ref. */
function item(now, o) {
  const { kind, mapId = MAIN, ref, minutes = 30 } = o;
  return {
    id: `${kind}:${mapId}:${ref}`,
    kind,
    mapId,
    ...(o.ticketId ? { ticketId: o.ticketId } : {}),
    title: o.title,
    since: now - minutes * 60_000,
    urgency: o.urgency ?? 'soon',
    score: o.score ?? 40,
    reasons: o.reasons,
    batchKey: `${kind}:${mapId}:${ref}`,
    ref,
    ...(o.agent ? { agent: o.agent } : {}),
    ...(o.rule ? { rule: o.rule } : {}),
  };
}

/** Every kind not seeded, each the way its source makes it; held passes twice (the check guard, a flaky check). */
export function builtItems(now) {
  const at = (o) => item(now, o);
  return [
    at({
      kind: 'approval',
      ref: '24',
      ticketId: '24',
      title: 'Approve #24 Show sync status in the note list',
      reasons: ['the checks passed and the reviewer agreed; approval is yours by the trail’s verification level'],
    }),
    at({
      kind: 'approval',
      mapId: OTHER,
      ref: '21',
      ticketId: '21',
      title: 'Approve #21 Invite members by email',
      reasons: ['on Team workspaces: the checks passed, the level asks for your approval'],
    }),
    at({
      kind: 'blocked',
      ref: '15',
      ticketId: '15',
      urgency: 'blocking',
      title: 'Decide on held #15 Implement offline write queue behind a flag',
      reasons: [
        'held by the check guard: this attempt changed test/queue.test.ts, which the passing check `npm test` runs',
        'you can accept it without test',
      ],
    }),
    at({
      kind: 'blocked',
      ref: '5',
      ticketId: '5',
      title: 'Decide on held #5 Spike Automerge on React Native with 10k notes',
      reasons: ['test failed, then passed on a re-run: flaky in 3 of the last 10 runs, so the pass is held for you'],
    }),
    at({
      kind: 'flag',
      ref: '23/ci-failing',
      ticketId: '23',
      title: '#23: CI fails on its pull request after the last push (typecheck, test, lint)',
      reasons: ['PR #118 · 3 checks failing on 9f2c1ab'],
    }),
    at({
      kind: 'stalled',
      ref: '7',
      ticketId: '7',
      agent: 'claude-05',
      title: 'claude-05 stopped reporting on #7',
      reasons: ['claim stalled', 'claude-05 idle for 42 min'],
    }),
    at({
      kind: 'integration',
      ref: '5+24',
      ticketId: '24',
      title: 'Two branches changed the same files',
      reasons: [
        'teamtrail/offline-first-sync-for-fieldnote/5 and …/24 both change src/sync/queue.ts',
        'nothing is merged',
      ],
    }),
    at({
      kind: 'merge',
      ref: '23/merge',
      ticketId: '23',
      title: '#23: PR #118 ready to merge',
      reasons: ['verified at the PR’s head'],
    }),
    at({
      kind: 'escape',
      ref: '23/reverted',
      ticketId: '23',
      title: '#23 was verified, then reverted: add a rule?',
      reasons: ['reverted in a1b2c3d by @grace two days after it merged', 'all 3 checks passed'],
      rule: { when: ['src/sync/**', 'migrations/**'], why: 'reverted after verification' },
    }),
    at({
      kind: 'delivery',
      mapId: '',
      ref: 'slack',
      title: "Slack messages aren't getting through",
      reasons: ['channel_not_found: Scout was removed from #fieldnote-sync', '4 refused in a row'],
    }),
    at({
      kind: 'tracker-settings',
      ref: '8:k2x9',
      ticketId: '8',
      title: '@mona changed the settings of #8 in the tracker',
      reasons: ['verification: checks → off', 'yours stay in force until you set them here'],
    }),
    at({
      kind: 'tracker-settings',
      ref: `${MAIN}:p3q1`,
      title: "Teamtrail doesn't know which settings you accepted for this trail",
      reasons: ["using the stricter of these and your project's until you choose", 'completions wait for you'],
    }),
    at({
      kind: 'tracker-settings',
      mapId: '',
      ref: 'record',
      title: "Teamtrail couldn't record which tracker settings you accepted",
      reasons: [
        'its record on this machine (.agents/tracker-settings) was locked',
        'if it keeps happening, check that nothing else holds the .lock file',
      ],
    }),
    at({
      kind: 'tracker-refused',
      ref: '8/claim/1',
      ticketId: '8',
      title: 'GitHub refused a write: claim #8 for claude-05',
      reasons: [
        'GitHub said: Resource not accessible by personal access token (issues: write)',
        "it didn't happen in the tracker: fix access or the issue, then retry, or discard it",
      ],
    }),
    at({
      kind: 'tracker-refused',
      ref: 'trail/3',
      title: 'Linear refused 3 writes: close #9, status of #10, settings of this trail',
      reasons: [
        'Linear said: Entity not found: Issue',
        "they didn't happen in the tracker: fix access or the issues, then retry, or discard them",
      ],
    }),
    at({
      kind: 'precedent',
      ref: '15/D-3',
      ticketId: '15',
      title: 'Check #15: it changes what D-3 decided',
      reasons: ['D-3: Last-write-wins for single-user notebooks (you)', 'changed src/sync/merge.ts, src/sync/clock.ts'],
    }),
    at({
      kind: 'review-limit',
      ref: 'review-limit',
      ticketId: '24',
      title: 'Review 4 finished tickets: agents wait for you',
      reasons: ["4 waiting, the team's limit is 3", '2 ready tickets held back', 'start with #24, waiting longest'],
    }),
    at({
      kind: 'main-checks',
      ref: 'M-2',
      urgency: 'blocking',
      title: 'Checks fail on main: test, typecheck',
      reasons: ['the trail starts from main', 'choose how the trail goes on'],
    }),
    at({
      kind: 'trail-checks',
      ref: 'T-1',
      title: 'The trail’s done work fails on main together: test',
      reasons: ['#23 and #24 pass alone', 'test fails on their merge'],
    }),
    at({
      kind: 'readiness',
      mapId: '',
      ref: 'readiness',
      urgency: 'blocking',
      title: "Teamtrail can't verify work yet: you haven't approved verification.json's checks on this machine",
      reasons: ['and 3 more things in Repo readiness', '4 ready tickets held back'],
    }),
    at({
      kind: 'reroute-suggested',
      ref: 'S-2',
      ticketId: '9',
      title: 'Reroute suggested: S-2 “Users review conflicts in a queue” was challenged by #9’s prototype',
      reasons: ['ask an agent to propose a new plan, or carry on'],
    }),
  ];
}

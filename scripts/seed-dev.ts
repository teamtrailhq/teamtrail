// Resets the local development tracker to a fixed, known project, so working on Teamtrail looks like real use.
// It writes plain files through the same adapters a real install uses: trails, tickets, decisions,
// verification config, discovery briefs, project knowledge, the risk policy, assumptions and reroute proposals. Live agents come from `npm run dev:agent`, a real MCP client.
// Run: npm run seed   (folder: $<DATA_DIR_ENV>, else <dataDir> at the repo root)
// Safety: only a folder this script created (it holds DEV_MARKER) is wiped; anything else is refused.
import fs from 'node:fs';
import path from 'node:path';
import {
  BRAND,
  DISCOVERY_TICKET,
  MarkdownAdapter,
  seedSnapshot,
  setMapMode,
  type KnowledgeEntry,
} from '@teamtrail/core';
import { writeBrief, writeKnowledge, writeTicketCriteria } from '@teamtrail/core/agents';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { seedGuides } from './seedGuides';
import { seedHistory } from './seedHistory';
import { seedModels } from './seedModels';
import { seedParallel } from './seedParallel';
import { seedProjects } from './seedProjects';
import { seedSupervision } from './seedSupervision';

const DEV_MARKER = '.dev-seed';
// Bundled to node_modules/.cache before it runs, so the repo root comes from npm, not from the file's path.
const repoRoot = process.env.npm_config_local_prefix ?? process.cwd();
const root = path.resolve(repoRoot, process.env[BRAND.dataDirEnv] || BRAND.dataDir);

if (fs.existsSync(root)) {
  const owned = fs.existsSync(path.join(root, DEV_MARKER));
  const empty = fs.readdirSync(root).length === 0;
  if (!owned && !empty) {
    console.error(`${root} exists and was not created by the dev seed; refusing to wipe it.`);
    console.error(`Point ${BRAND.dataDirEnv} at another folder, or delete it yourself if it is disposable.`);
    process.exit(1);
  }
  fs.rmSync(root, { recursive: true, force: true });
}
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(
  path.join(root, DEV_MARKER),
  'Created by npm run seed. Reset on every seed; do not keep real work here.\n',
);

// The repo's checks, as a team would commit them: verification runs real commands on completion.
fs.writeFileSync(
  path.join(root, 'verification.json'),
  `${JSON.stringify(
    {
      v: 1,
      default: 'checks',
      checks: {
        typecheck: { run: ['npm', 'run', 'typecheck'], timeoutSec: 300 },
        test: { run: ['npm', 'test'], timeoutSec: 600 },
      },
      run: ['typecheck', 'test'],
    },
    null,
    2,
  )}\n`,
);

const adapter = new MarkdownAdapter(nodeMarkdownFs(root), root);

// 1. A trail mid-flight: decisions made and superseded, work done, blocked, ruled out of scope.
const main = await seedSnapshot(adapter);

// 2. A second, plan-only trail, so the switcher and cross-trail views have something to show.
const second = await adapter.createMap({
  title: 'Team workspaces',
  mode: 'plan-only',
  sections: {
    destination: 'Teams share notebooks with roles, and admins manage members without contacting support.',
    notes: 'Admins asked for this in the Q3 survey. Must work with existing SSO.',
    decisions: [],
    unspecified: ['Audit log of membership changes'],
    outOfScope: ['Billing changes'],
  },
});
const who = await adapter.createTicket(second.id, {
  title: 'Who is the primary user of team workspaces?',
  type: 'junction',
  hitl: true,
  body: '',
});
const prior = await adapter.createTicket(second.id, {
  title: 'Prior art for team workspaces',
  type: 'research',
  hitl: false,
  body: '',
});
const roles = await adapter.createTicket(second.id, {
  title: 'Which roles do we ship first?',
  type: 'junction',
  hitl: true,
  body: '',
});
await adapter.addBlocking(second.id, who.id, roles.id);
await adapter.addBlocking(second.id, prior.id, roles.id);
await setMapMode(adapter, second.id, 'plan-only');

// 3. Discovery: the mid-flight trail's brief is accepted; the plan-only one has a brief waiting for review.
const day = 86_400_000;
const now = Date.now();
const mainBrief = {
  mapId: main.id,
  status: 'accepted' as const,
  author: 'claude-01',
  submittedAt: now - 2 * day,
  decidedAt: now - 2 * day + 3_600_000,
  sections: {
    summary:
      'Add offline editing to the Fieldnote mobile app, with edits that merge cleanly when the device reconnects.',
    productContext:
      'Field researchers work for days without signal. Losing an edit is the worst outcome; a visible merge summary is acceptable.',
    existing:
      '- `src/sync/client.ts`: pushes edits when online, no queue\n- `src/storage/notes.ts`: notes in SQLite on device\n- `src/api/notes.ts`: the notes API, last write wins',
    conventions: 'Storage goes through `src/storage`; the API client is generated from `api/openapi.yaml`.',
    dataModel: 'Each note gets a version vector and a pending-edits queue on device.',
    api: 'New batch endpoint for queued edits; the existing endpoints stay.',
    risks: 'Large merges on low-end phones; duplicate edits if a batch is retried.',
    assumptions: [
      { id: 'A-1', text: 'Notes stay under 10,000 per device' },
      { id: 'A-2', text: 'The API can accept batches of edits' },
    ],
    openQuestions: ['Do shared notebooks need a merge review?'],
  },
};
writeBrief(root, mainBrief);
const discovery = await adapter.createTicket(second.id, { ...DISCOVERY_TICKET, hitl: false });
await adapter.addBlocking(second.id, discovery.id, roles.id);
writeBrief(root, {
  mapId: second.id,
  status: 'submitted',
  ticketId: discovery.id,
  author: 'claude-02',
  submittedAt: now - 3_600_000,
  sections: {
    summary: 'Add team workspaces with roles, building on the existing organization and SSO model.',
    productContext:
      'Admins manage members themselves; today every change goes through support. Members must never see another team’s notebooks.',
    existing:
      '- `src/auth/sso.ts`: SAML and Google sign-in, one organization per user\n- `src/notebooks/permissions.ts`: owner-only sharing today\n- `src/admin/`: no member management yet',
    conventions: 'Permissions are checked in one place, `src/notebooks/permissions.ts`; never in the UI.',
    dataModel: 'New workspace and membership tables; notebooks get a workspace id.',
    api: 'New workspace and member endpoints; sharing endpoints gain a workspace scope.',
    risks: 'Migrating existing shared notebooks into a default workspace; SSO users without a workspace.',
    assumptions: [
      { id: 'A-1', text: 'One workspace per team is enough at first' },
      { id: 'A-2', text: 'SSO groups can map to workspaces later' },
    ],
    openQuestions: ['Can a member belong to more than one workspace?', 'Who can delete a workspace?'],
  },
});

// 4. Project knowledge: confirmed facts and rules, an assumption, and suggestions waiting for review.
const entry = (
  n: number,
  e: Partial<KnowledgeEntry> & Pick<KnowledgeEntry, 'title' | 'body' | 'kind'>,
): KnowledgeEntry => ({
  id: `K-${n}`,
  status: 'confirmed',
  scope: [],
  tags: [],
  sources: [`trail:${main.key}`],
  anchors: [],
  createdBy: 'claude-01',
  createdAt: now - 3 * day,
  updatedAt: now - 2 * day,
  ...e,
});
for (const e of [
  entry(1, {
    kind: 'business-rule',
    title: 'Never lose a field edit',
    body: 'A user’s edit must survive any sync conflict. When two edits clash, keep both and show a merge summary.',
    tags: ['sync', 'merge'],
  }),
  entry(2, {
    kind: 'persona',
    title: 'Field researchers are offline for days',
    body: 'The primary user works with multi-day dead zones. Anything that needs a connection to save is a bug.',
    tags: ['offline'],
    createdBy: 'trail lead',
  }),
  entry(3, {
    kind: 'convention',
    title: 'Storage goes through src/storage',
    body: 'Never write SQLite directly from screens; use the storage module so migrations stay in one place.',
    scope: ['src/storage/**', 'src/sync/**'],
    tags: ['storage'],
  }),
  entry(4, {
    kind: 'gotcha',
    title: 'Batch retries can duplicate edits',
    body: 'A retried batch replays every edit in it. Edits carry an id so the server can drop duplicates.',
    status: 'assumption',
    tags: ['sync'],
    createdBy: 'claude-02',
  }),
  entry(5, {
    kind: 'dead-end',
    title: 'Silent auto-merge of shared notebooks lost edits',
    body: 'The prototype merged shared notebooks without telling anyone, and edits disappeared. Shared notebooks need a visible merge review.',
    status: 'suggested',
    tags: ['merge'],
    createdBy: 'claude-02',
    sources: [`trail:${main.key}`, 'ticket:#6'],
  }),
  entry(6, {
    kind: 'business-rule',
    title: 'Members never see another team’s notebooks',
    body: 'Workspace isolation is absolute: search, sharing and exports are all scoped to the member’s workspace.',
    status: 'suggested',
    tags: ['workspaces', 'permissions'],
    createdBy: 'claude-02',
    sources: [`trail:${second.key}`],
  }),
])
  writeKnowledge(root, e);

// 5. Acceptance criteria on the instrumentation task, one taken from a business rule.
const instrument = (await adapter.loadMap(main.id)).tickets.find((t) => t.type === 'task' && t.state === 'open');
if (instrument)
  writeTicketCriteria(root, main, instrument, {
    criteria: [
      { id: 'AC-1', kind: 'unit', text: 'Every sync failure is counted with its cause' },
      { id: 'AC-2', kind: 'business-rule', source: 'K-1', text: 'Counting never drops or changes a user’s edit' },
      { id: 'AC-3', kind: 'manual', text: 'The dashboard shows last week’s failure rate' },
    ],
  });

// 6. Less supervision: risk policy, attention rules, a risky change, assumptions and two pending proposals.
await seedSupervision({ root, adapter, main, second, mainBrief, now });

// 7. Safe parallel work: the worktree setting and two claims whose declared files overlap.
await seedParallel({ root, adapter, main, now });

// 8. Model matching: on for the main trail, a project model table, and two agents on different models.
await seedModels({ root, adapter, main, now });
// 9. Guides: a team, guides on tickets, a pinned catalog guide with a check to approve, a hand-written one to approve.
await seedGuides({ root, adapter, main, now });

// 10. A finished trail with two vendors' work on it, for Trail stats.
const history = await seedHistory({ root, adapter, now });

// 11. More than one project: a second repo and a missing one in a dev-only registry, for All projects.
const projects = await seedProjects({ repoRoot, homeRoot: root, now });

console.log(`seeded ${root}`);
console.log(`  ${main.key} ${main.title} · mid-flight`);
console.log(`  ${second.key} ${second.title} · plan only, brief waiting for review`);
console.log('  6 knowledge entries (confirmed, an assumption, 2 suggestions)');
console.log(
  '  policy.json, attention.json, 3 assumptions (one challenged), a pending reroute, a destination challenge',
);
console.log(
  '  workspaces.json (worktrees off), two claims whose declared files overlap (#5 and the sync status ticket)',
);
console.log(
  '  model matching on #1, models.json, codex-01 (fast) and claude-05 (balanced) connected; a junction waits for a strongest model',
  '  guides: a team on the main trail, 4 tickets with guides, a11y (check waiting), perf (waiting for approval)',
);
console.log(`  ${history.key} ${history.title} · finished, with results from two vendors for Trail stats`);
console.log(`  projects: this repo, billing-service and a missing one (registry ${projects.config})`);
console.log('Live agents: npm run dev:agent (needs npm run build -w teamtrail once).');
process.exit(0);

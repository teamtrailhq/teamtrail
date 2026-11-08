// End-to-end check of the MCP server against the built CLI: a stdio MCP client drives a trail while the
// Lookout (in Chrome) shows it live, and every HITL question is answered in the Lookout inbox.
// Usage: npm run build -w teamtrail && node scripts/verify-mcp.mjs [screenshotDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright-core';
import { verifyModels } from './verifyModels.mjs';
import { verifyParallel } from './verifyParallel.mjs';
import { verifyProjects } from './verifyProjects.mjs';
import { verifySupervision } from './verifySupervision.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../packages/cli/dist/cli.js');
const shots = process.argv[2];
if (!fs.existsSync(cli)) throw new Error('build the CLI first: npm run build -w teamtrail');
if (shots) fs.mkdirSync(shots, { recursive: true });

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-e2e-'));
// Never the user's config dir, and no projects registry for the single-repo steps: they must look exactly as with
// one repo. verifyProjects.mjs uses its own config dir with auto-registration on.
process.env.TEAMTRAIL_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-e2e-config-'));
process.env.TEAMTRAIL_NO_REGISTER = '1';
const log = (...a) => console.log('·', ...a);

// The repo's own check, which passes once fixed.txt exists. With verification.json present, new trails
// verify execute and task completions with it; research and junction tickets close as before.
const CHECK = "if (!require('fs').existsSync('fixed.txt')) { console.error('fixed.txt is missing'); process.exit(1) }";
fs.writeFileSync(
  path.join(repo, 'package.json'),
  JSON.stringify({ private: true, scripts: { check: `node -e "${CHECK}"` } }),
);
fs.mkdirSync(path.join(repo, '.teamtrail'));
fs.writeFileSync(
  path.join(repo, '.teamtrail', 'verification.json'),
  JSON.stringify({
    v: 1,
    default: 'checks',
    checks: { check: { run: ['npm', 'run', '--silent', 'check'], timeoutSec: 60 } },
    run: ['check'],
  }),
);

// 1. The Lookout, as the user starts it.
const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd: repo });
const url = await new Promise((resolve, reject) => {
  let out = '';
  server.stdout.on('data', (c) => {
    out += c;
    const m = out.match(/Lookout\s+(http:\S+)/);
    if (m) resolve(m[1]);
  });
  server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
});
log('Lookout', url);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.locator('.dialog.onboarding').waitFor();
await page.getByRole('button', { name: 'Get started' }).click();
const shot = async (name) => {
  await page.waitForTimeout(700);
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
};

// 2. The agent, as Claude Code starts it (`claude mcp add teamtrail -- npx teamtrail mcp`): Claude Code passes
// CLAUDE_PROJECT_DIR and tags each call with its tool_use id; the transcript holds the API usage of every message.
const claudeConfig = path.join(repo, '.claude-config');
const transcript = path.join(claudeConfig, 'projects', repo.replace(/[^a-zA-Z0-9]/g, '-'), 'verify-session.jsonl');
fs.mkdirSync(path.dirname(transcript), { recursive: true });
const PER_MESSAGE = {
  input_tokens: 200,
  cache_creation_input_tokens: 300,
  cache_read_input_tokens: 1500,
  output_tokens: 150,
};
const PER_MESSAGE_USD = (200 * 3 + 300 * 3.75 + 1500 * 0.3 + 150 * 15) / 1e6;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, 'mcp'],
  cwd: repo,
  stderr: 'pipe',
  env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfig, CLAUDE_PROJECT_DIR: repo },
});
const client = new Client({ name: 'claude-code', version: '2.1.0' });
await client.connect(transport);
const tools = (await client.listTools()).tools.map((t) => t.name);
log(`MCP connected · ${tools.length} tools: ${tools.join(', ')}`);
let seq = 0;
const call = async (name, args = {}) => {
  const id = `toolu_verify_${Date.now().toString(36)}_${seq++}`;
  const message = {
    id: `msg_verify_${seq}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    content: [{ type: 'tool_use', id, name: `mcp__teamtrail__${name}`, input: args }],
    usage: PER_MESSAGE,
  };
  fs.appendFileSync(
    transcript,
    `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), requestId: `req_${seq}`, message })}\n`,
  );
  const r = await client.callTool({ name, arguments: args, _meta: { 'claudecode/toolUseId': id } }, undefined, {
    timeout: 120_000,
  });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  // A real agent's next message comes a model round trip after the result. Without the pause it can share the
  // millisecond a session ended in, and the meter cannot tell which side of the boundary it belongs to.
  await new Promise((done) => setTimeout(done, 5));
  return JSON.parse(r.content[0].text);
};

/** Opening a ticket zooms the map onto it, so other tickets can be out of view: Fit first, as a user would. */
async function clickNode(node) {
  await page.locator('.fit-btn').click();
  await page.waitForTimeout(500);
  await node.click();
}

/** Answer the open question in the Lookout inbox, by suggestion chip or by typing. */
async function answerInUi(text, { chip = false } = {}) {
  await page.locator('.inbox-list li button').first().waitFor({ timeout: 15_000 });
  await page.locator('.inbox-list li button').first().click();
  if (chip) await page.locator('.suggest .chip', { hasText: text }).click();
  else {
    await page.locator('.comms-input textarea').fill(text);
    await page.locator('.comms-input textarea').press('Enter');
  }
}

// /scout new: framing question, answered in the Lookout.
const framing = call('ask_human', {
  question: 'Who is the changelog page for?',
  suggestions: ['Users of the CLI', 'Contributors'],
  framing: true,
});
await page.locator('.inbox-list li').first().waitFor({ timeout: 15_000 });
await shot('01-framing-question-in-inbox');
await answerInUi('Users of the CLI', { chip: true });
const f = await framing;
log(`framing answered in UI: "${f.answer}" by ${f.answeredBy}`);

const started = await call('start_trail', {
  discovery: false,
  title: 'Changelog page',
  destination: 'A public changelog page generated from release notes',
  decided: ['Static page, no backend'],
  unspecified: ['RSS feed'],
  outOfScope: ['Email digests'],
  tickets: [
    { ref: 'src', title: 'Where do release notes live today?', type: 'research' },
    { ref: 'layout', title: 'Timeline or grouped by version?', type: 'junction', blockedBy: ['src'] },
    { ref: 'host', title: 'Where is it hosted?', type: 'research' },
    { ref: 'build', title: 'Build the changelog page', type: 'execute', blockedBy: ['layout', 'host'] },
  ],
});
log(`trail ${started.trail.key} "${started.trail.title}" · ${started.tickets.length} tickets`);
await page.locator('.node').nth(3).waitFor({ timeout: 15_000 });
await shot('02-trail-charted-by-agent');

// /scout resume: claim, report, close.
await call('resume_trail');
const c1 = await call('claim_ticket');
log(`claimed ${c1.claimed.key} (${c1.claimed.attention})`);
await call('report_progress', {
  step: 'Investigate',
  message: 'reading apps/lookout/src/changelog.ts',
  inputTokens: 18_400,
  outputTokens: 2_100,
  costUsd: 0.087,
});
const d1 = await call('close_ticket', {
  resolution: 'Release notes live in the in-app changelog module (RELEASES). Generate the page from it.',
  rationale: 'One source for the app and the page',
  alternatives: ['GitHub releases', 'A separate CHANGELOG.md'],
});
log(`closed ${d1.closed} · ${d1.decision.id} · unblocked ${d1.unblocked.map((t) => t.key).join(', ')}`);

const c2 = await call('claim_ticket');
log(`claimed ${c2.claimed.key} (${c2.claimed.attention})`);
await call('report_progress', {
  say: 'The notes are grouped by release already. One question before I decide the layout.',
  inputTokens: 6_200,
  outputTokens: 900,
  costUsd: 0.032,
});
const hitl = call('ask_human', {
  question: 'Timeline, or grouped by version with the newest first?',
  suggestions: ['Grouped by version', 'Timeline'],
});
await page.locator('.inbox-list li').first().waitFor({ timeout: 15_000 });
await page.locator('.inbox-list li button').first().click();
await shot('03-agent-question-waiting-on-you');
await answerInUi('Grouped by version, newest first');
const h = await hitl;
log(`HITL answered in UI: "${h.answer}" after ${h.waitedSeconds}s`);
const d2 = await call('close_ticket', {
  resolution: 'Group entries by version, newest first, one section per release.',
  postTranscript: true,
});
log(`closed ${d2.closed} · ${d2.decision.id} decided by ${d2.decision.decidedBy}`);
await call('record_decision', {
  question: 'Link it from the landing page?',
  answer: 'Yes, in the footer next to GitHub.',
  rationale: 'Low cost, easy to find',
});

const c3 = await call('claim_ticket');
await call('report_progress', {
  step: 'Investigate',
  message: 'checking the landing deploy',
  inputTokens: 9_000,
  outputTokens: 800,
  costUsd: 0.04,
});
log(`claimed ${c3.claimed.key}; left running so the sessions zone shows a live session`);

const status = await call('status');
log(
  `status: ${status.trail.progress} · ready ${status.trail.ready.map((t) => t.key).join(', ') || '—'} · spend $${status.trail.spend.costUsd} (${status.trail.spend.inputTokens + status.trail.spend.outputTokens} tokens) from ${status.trail.spend.sources.join(', ')}`,
);
// Every transcript message counts (the status call's own too) except record_decision's: it ran between tickets,
// with no session open. The numbers passed to report_progress are ignored.
const measured = seq - 1;
const spendOk =
  status.trail.spend.sources.join() === 'claude-code' &&
  Math.abs(status.trail.spend.costUsd - Math.round(measured * PER_MESSAGE_USD * 1e4) / 1e4) < 1e-4;
log(
  `measured spend ${spendOk ? 'matches' : 'DOES NOT match'} ${measured} transcript messages ($${(measured * PER_MESSAGE_USD).toFixed(6)})`,
);
// The trail report: two tickets done, the HITL answer counted, lead times measured from the journal.
const d = status.delivery;
const deliveryOk = d?.done === 2 && d.interventions.answers >= 1 && d.medianLeadMs >= 0 && /2 done/.test(d.summary);
log(`delivery ${deliveryOk ? 'ok' : 'WRONG'}: ${d?.summary}`);
const uiTokens = `${((measured * 2150) / 1000).toFixed(1)}k tok`;
await page
  .locator('.sessions-head .usage', { hasText: uiTokens })
  .first()
  .waitFor({ timeout: 15000 })
  .catch(() => {});
await shot('04-live-session-and-decisions');

const ui = {
  decided: await page.locator('.node.st-decided, .node.decided').count(),
  sessions: await page.locator('.sessions-list li:not(.claim)').count(),
  usage: (await page.locator('.header .readout.spend b').first().textContent())?.trim(),
  usageSource: await page
    .locator('.header .readout.spend')
    .first()
    .evaluate((el) => [el.getAttribute('title'), el.getAttribute('data-tip')].filter(Boolean).join('\n')),
};
log(
  `Lookout shows: ${ui.sessions} live session(s), trail usage "${ui.usage}" (${ui.usageSource?.split('\n').slice(1).join('; ') || 'no source'})`,
);

// Crash recovery: a second agent (18 s lease) claims a ticket, reports progress and is SIGKILLed. The Lookout
// shows the claim as stalled, returns it to the queue once the lease runs out, and the next claim resumes from the notes.
// The lease is stalled for its last third (6 s) until the reaper (every 15 s) returns it; the map re-checks lease health
// every 5 s, so the stalled window must outlast that or a fast reap can skip it on a slow machine.
const added = await call('add_ticket', { title: 'Which date format?', type: 'research' });
const crashTransport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, 'mcp', '--agent', 'claude-09', '--lease-minutes', '0.3'],
  cwd: repo,
  stderr: 'pipe',
  env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(repo, '.claude-crash'), CLAUDE_PROJECT_DIR: repo },
});
const crashClient = new Client({ name: 'claude-code', version: '2.1.0' });
await crashClient.connect(crashTransport);
const crashCall = async (name, args = {}) =>
  JSON.parse((await crashClient.callTool({ name, arguments: args })).content[0].text);
const crashed = await crashCall('claim_ticket', { ticket: added.ticket.key });
await crashCall('report_progress', { step: 'Investigate', message: 'ISO dates in the feed, relative dates in the UI' });
process.kill(crashTransport.pid, 'SIGKILL');
log(`claude-09 claimed ${crashed.claimed.key} (lease ${crashed.lease.length}) and was killed`);
const stalledNode = page.locator('.node.stalled', { hasText: 'Which date format?' });
await stalledNode.waitFor({ timeout: 30_000 });
await clickNode(stalledNode);
await page.locator('.lease-stalled, .lease-expired').waitFor({ timeout: 10_000 });
await shot('05-stalled-claim');
const returnedLog = page.locator('.log-row', {
  hasText: `${crashed.claimed.key} returned to queue after claude-09 went silent`,
});
await returnedLog.first().waitFor({ timeout: 60_000 });
log('Lookout returned the ticket to the queue: "ticket returned to queue after agent went silent" logged');
const resumed = await call('claim_ticket', { ticket: added.ticket.key });
const handoffOk =
  resumed.claimed.assignee !== 'claude-09' &&
  /claude-09 went silent/.test(resumed.claimed.resume?.handoff ?? '') &&
  /ISO dates in the feed/.test(resumed.claimed.resume?.handoff ?? '');
log(
  `${resumed.claimed.assignee} claimed ${resumed.claimed.key}; handoff ${handoffOk ? 'carries' : 'DOES NOT carry'} claude-09's notes`,
);

// Manual release from the inspector; the agent learns on its next call and its session on the ticket ends.
await clickNode(page.locator('.node', { hasText: 'Which date format?' }));
await page.getByRole('button', { name: 'Release to queue' }).click();
const releasedLog = page.locator('.log-row', {
  hasText: `${added.ticket.key} returned to queue · claim of ${resumed.claimed.assignee} released by trail lead`,
});
await releasedLog.first().waitFor({ timeout: 15_000 });
const told = await call('status');
const releaseOk =
  told.leaseLost?.tickets?.includes(added.ticket.key) && !told.trail.claimed.some((t) => t.key === added.ticket.key);
log(`released in the Lookout; the agent ${releaseOk ? 'was told' : 'WAS NOT told'} its claim is gone`);
await shot('06-released-to-queue');
await crashClient.close().catch(() => {});

// Verified completion: the completion fails the repo's check and comes back for rework with the failing output;
// once the agent fixes the cause, the check passes and the ticket is done.
const route = await call('add_ticket', { title: 'Add the /changelog route', type: 'execute' });
const vc = await call('claim_ticket', { ticket: route.ticket.key });
const failed = await call('close_ticket', { ticket: route.ticket.key, resolution: 'Added the /changelog route' });
const reworkOk =
  vc.claimed.verification?.checks?.[0]?.name === 'check' &&
  failed.status === 'rework' &&
  /fixed.txt is missing/.test(failed.feedback?.[0]?.tail ?? '');
log(
  `${route.ticket.key} completion ${failed.status}: ${failed.feedback?.[0]?.check} exited ${failed.feedback?.[0]?.exitCode}`,
);
const reworkNode = page.locator('.node.st-rework', { hasText: /Add the \/changelog/ });
await reworkNode.waitFor({ timeout: 15_000 });
await clickNode(reworkNode);
const reworkPill = await page
  .locator('.pill.st-rework, .st-rework .pill, [class*="st-rework"]', { hasText: 'Rework' })
  .count();
await shot('07-rework');
fs.writeFileSync(path.join(repo, 'fixed.txt'), 'ok');
await call('claim_ticket', { ticket: route.ticket.key });
const passed = await call('close_ticket', { ticket: route.ticket.key, resolution: 'Added the /changelog route' });
await page.locator('.node.st-decided', { hasText: /Add the \/changelog/ }).waitFor({ timeout: 15_000 });
await shot('08-verified');
const verifiedOk = reworkOk && reworkPill > 0 && passed.status === 'done' && passed.closed === route.ticket.key;
log(
  `${route.ticket.key} ${verifiedOk ? 'verified' : 'NOT verified'}: ${passed.attempt} ${passed.status}, rework shown in the Lookout`,
);

// Independent review: at checks+review+human a passing completion gets a review ticket. The worker is never given its
// own review; a second agent passes it, and the trail lead approves from the Lookout inbox.
const api = new URL('/__teamtrail/verification/action', url);
await fetch(api, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'level', mapId: started.trail.id, level: 'checks+review+human' }),
});
const footer = await call('add_ticket', { title: 'Link the changelog from the footer', type: 'execute' });
await call('claim_ticket', { ticket: footer.ticket.key });
const submitted = await call('report_completion', {
  ticket: footer.ticket.key,
  resolution: 'Linked the changelog from the footer',
});
const ownNext = await call('next_ticket');
const reviewTransport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, 'mcp', '--agent', 'claude-02'],
  cwd: repo,
  stderr: 'pipe',
  env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(repo, '.claude-review'), CLAUDE_PROJECT_DIR: repo },
});
const reviewClient = new Client({ name: 'claude-code', version: '2.1.0' });
await reviewClient.connect(reviewTransport);
const reviewCall = async (name, args = {}) => {
  const r = await reviewClient.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
};
const offered = (await reviewCall('next_ticket')).ticket;
const ownClaim = await call('claim_ticket', { ticket: offered.key }).then(
  () => 'allowed',
  (e) => e.message,
);
await reviewCall('claim_ticket', { ticket: offered.key });
const reviewed = await reviewCall('submit_review', {
  verdict: 'PASS',
  summary: 'The footer links to /changelog and the check passes.',
});
await reviewClient.close().catch(() => {});
const approval = page.locator('.inbox-list.approvals li', { hasText: 'Link the changelog' });
await approval.waitFor({ timeout: 15_000 });
await shot('09-approval-waiting-on-you');
await approval.locator('button').first().click();
await page.getByRole('button', { name: 'Approve', exact: true }).click();
await page.locator('.node.st-decided', { hasText: /Link the changelog/ }).waitFor({ timeout: 15_000 });
await shot('10-approved');
const reviewOk =
  submitted.status === 'verifying' &&
  ownNext.ticket?.type !== 'review' &&
  /worked on/.test(ownClaim) &&
  offered.type === 'review' &&
  reviewed.phase === 'verifying' &&
  (await page.locator('.inbox-list.approvals li').count()) === 0;
log(
  `${footer.ticket.key} ${reviewOk ? 'reviewed and approved' : 'NOT reviewed and approved'}: own review refused (${ownClaim.replace(/^claim_ticket: /, '')}), ${offered.key} ${reviewed.verdict} by claude-02, approved in the Lookout`,
);

// Discovery: a new trail starts with a discovery ticket; implementation waits until the trail lead accepts the
// brief in the Lookout.
const disc = await call('start_trail', {
  title: 'Search the changelog',
  destination: 'Readers find a release by keyword',
  tickets: [{ ref: 'build', title: 'Build changelog search', type: 'execute' }],
});
const buildKey = disc.tickets.find((t) => t.type === 'execute').key;
const gated = await call('claim_ticket', { ticket: buildKey }).then(
  () => '',
  (e) => e.message,
);
await page.locator('.trail-btn').click();
await page.getByRole('menuitem').filter({ hasText: 'Search the changelog' }).first().click();
await page.locator('.discovery-banner').waitFor({ timeout: 15_000 });
await call('submit_brief', {
  summary: 'Add a client-side search over the generated changelog page.',
  existing: '- `fixed.txt`: the repo check this project uses',
  assumptions: ['Releases stay under a few hundred'],
});
await page.getByRole('button', { name: 'Review brief' }).click({ timeout: 15_000 });
await page.locator('.brief-dialog').waitFor();
await shot('11-discovery-brief');
await page.getByRole('button', { name: 'Accept brief' }).click();
await page.locator('.discovery-banner').waitFor({ state: 'detached', timeout: 15_000 });
const unlocked = await call('claim_ticket', { ticket: buildKey });
// Acceptance criteria: required before completing on a discovery trail; each needs evidence.
const noCriteria = await call('report_completion', { resolution: 'Search added' }).then(
  () => '',
  (e) => e.message,
);
await call('set_criteria', {
  ticket: buildKey,
  criteria: [{ text: "The repo's check passes", kind: 'regression' }],
});
const withEvidence = await call('report_completion', {
  resolution: 'Search added',
  criteria: [{ id: 'AC-1', evidence: 'check:check' }],
  waitSeconds: 60,
});
const discoveryOk =
  disc.discovery?.status === 'draft' &&
  /accepted discovery brief/.test(gated) &&
  unlocked.claimed.key === buildKey &&
  /needs acceptance criteria/.test(noCriteria) &&
  withEvidence.criteria?.[0]?.startsWith('AC-1 ✓') &&
  unlocked.discovery?.implementationClaimable === true;
log(
  `discovery ${discoveryOk ? 'ok' : 'WRONG'}: ${buildKey} held until the brief was accepted in the Lookout, then claimed; completion refused without criteria, then ${withEvidence.status} with ${withEvidence.criteria?.join('; ')}`,
);

// Less supervision: the ranked queue, the risk policy and a reroute approved in the Lookout.
const discoveryKey = disc.tickets.find((t) => t.title.startsWith('Discovery brief')).key;
const supervisionOk = await verifySupervision({ call, page, shot, log, repo, mapId: disc.trail.id, discoveryKey });

// Safe parallel work: worktrees, overlapping claims and an integration ticket, on a scratch git repo.
const parallelOk = await verifyParallel({ browser, cli, log, shots });

// Model-aware claiming: two agents on different models, matching switched on in the Lookout, on a scratch project.
const modelsOk = await verifyModels({ browser, cli, log, shots });
// Several repos: All projects, the merged queue and answering another repo's agent from it.
const projectsOk = await verifyProjects({ browser, cli, log, shots });

await client.close();
await page.waitForTimeout(1500);
const after = await page.locator('.sessions-list li:not(.claim)').count();
log(
  `after the agent disconnected: ${after} live session(s), ${await page.locator('.sessions-list li.claim').count()} claim kept for resume`,
);
// Trail stats: the ticket work from this run shows up by vendor.
await page.getByRole('button', { name: /^Records/ }).click();
await page.locator('.stats-btn').click();
await page.locator('.perf-row').first().waitFor({ timeout: 10000 });
log(
  `trail stats: ${await page.locator('.perf-row').count()} vendor row(s), first ${await page.locator('.perf-row .ds-row-title').first().textContent()}`,
);
await page.keyboard.press('Escape');
log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close();
server.kill('SIGTERM');
if (!process.env.KEEP) fs.rmSync(repo, { recursive: true, force: true });
else log('kept', repo);
fs.rmSync(process.env.TEAMTRAIL_CONFIG_DIR, { recursive: true, force: true });
if (
  errors.length ||
  !spendOk ||
  !deliveryOk ||
  !ui.usage?.includes(uiTokens) ||
  !/Measured from the Claude Code session transcript/.test(ui.usageSource ?? '') ||
  f.answer !== 'Users of the CLI' ||
  h.answer !== 'Grouped by version, newest first' ||
  status.trail.progress !== '2/4 decided' ||
  after !== 0 ||
  !handoffOk ||
  !releaseOk ||
  !verifiedOk ||
  !reviewOk ||
  !discoveryOk ||
  !supervisionOk ||
  !parallelOk ||
  !modelsOk ||
  !projectsOk
)
  process.exit(1);
console.log('\nOK');

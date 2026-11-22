// End-to-end check of the MCP server against the built CLI: a stdio MCP client drives a trail while the
// Lookout (in Chrome) shows it live, and every HITL question is answered in the Lookout inbox.
// Usage: npm run build -w teamtrail && node scripts/verify-mcp.mjs [screenshotDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright-core';
import {
  answeringChecklists,
  clickNode as clickNodeOn,
  handsOn,
  lookoutLinks,
  openFullTicket,
  openNeedsList,
  pairLink,
  sessionHeaders,
  signInWith,
  ticketAction,
} from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';
import { verifyBubbleMerge, verifyBubbleMergeAtHead } from './verifyBubbleMerge.mjs';
import { verifyCheckGuard } from './verifyCheckGuard.mjs';
import { verifyCheckSuggestions } from './verifyCheckSuggestions.mjs';
import { verifyCheckVariables } from './verifyCheckVariables.mjs';
import { verifyCommandNotes } from './verifyCommandNotes.mjs';
import { verifyEscapes } from './verifyEscapes.mjs';
import { verifyFlaky } from './verifyFlaky.mjs';
import { verifyGates } from './verifyGates.mjs';
import { verifyGitHub } from './verifyGitHub.mjs';
import { verifyGuides } from './verifyGuides.mjs';
import { verifyHandsOff } from './verifyHandsOff.mjs';
import { verifyHeaders } from './verifyHeaders.mjs';
import { verifyLinear } from './verifyLinear.mjs';
import { verifyLiveViews } from './verifyLiveViews.mjs';
import { verifyLongQuestion } from './verifyLongQuestion.mjs';
import { verifyMainChecks } from './verifyMainChecks.mjs';
import { verifyManaged } from './verifyManaged.mjs';
import { verifyModels } from './verifyModels.mjs';
import { verifyNeedsYouKinds } from './verifyNeedsYouKinds.mjs';
import { verifyNewRepo } from './verifyNewRepo.mjs';
import { verifyNewTrail } from './verifyNewTrail.mjs';
import { verifyNoChecksGap } from './verifyNoChecksGap.mjs';
import { verifyParallel } from './verifyParallel.mjs';
import { verifyPrLink } from './verifyPrLink.mjs';
import { verifyProjects } from './verifyProjects.mjs';
import { verifyProof } from './verifyProof.mjs';
import { verifyProofGaps } from './verifyProofGaps.mjs';
import { verifyReadiness } from './verifyReadiness.mjs';
import { verifyRemote } from './verifyRemote.mjs';
import { verifyRules } from './verifyRules.mjs';
import { verifyScreening } from './verifyScreening.mjs';
import { verifySetupSteps } from './verifySetupSteps.mjs';
import { verifySignedState } from './verifySignedState.mjs';
import { verifySignIn } from './verifySignIn.mjs';
import { verifySlack } from './verifySlack.mjs';
import { verifySupervision } from './verifySupervision.mjs';
import { verifyTrailChecks } from './verifyTrailChecks.mjs';
import { verifyWaiver } from './verifyWaiver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../packages/cli/dist/cli.js');
const shots = process.argv[2];
if (!fs.existsSync(cli)) throw new Error('build the CLI first: npm run build -w teamtrail');
if (shots) fs.mkdirSync(shots, { recursive: true });

const repo = e2eTemp('teamtrail-e2e-');
// Never the user's config dir, and no projects registry for the single-repo steps: they must look exactly as with
// one repo. verifyProjects.mjs uses its own config dir with auto-registration on.
process.env.TEAMTRAIL_CONFIG_DIR = e2eTemp('teamtrail-e2e-config-');
// The steps below were written for the map: this person works Hands-on. Hands-off, everyone's default, has its own
// steps on their own config dir (verifyHandsOff.mjs).
handsOn(process.env.TEAMTRAIL_CONFIG_DIR);
process.env.TEAMTRAIL_NO_REGISTER = '1';
// Nor the credentials of whoever runs this: no `gh` login, no token from the shell. Steps that need a token set
// their own, for a fake tracker.
process.env.TEAMTRAIL_NO_GH_CLI = '1';
for (const k of ['GITHUB_TOKEN', 'GH_TOKEN', 'LINEAR_API_KEY']) delete process.env[k];
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
const { url, pair } = await new Promise((resolve, reject) => {
  let out = '';
  server.stdout.on('data', (c) => {
    out += c;
    const links = lookoutLinks(out);
    if (links) resolve(links);
  });
  server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
});
log('Lookout', url);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// The link `teamtrail` printed signs this browser in and opens the Lookout, as it does for a person.
await signInWith(page, pair);
await page.locator('.dialog.onboarding').waitFor();
await page.getByRole('button', { name: 'Get started' }).click();
const shot = async (name) => {
  await page.waitForTimeout(700);
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
};

// 1b. First run: verification.json came with the repo, and nobody approved its commands on this machine, so they
// don't run yet. The human sees the exact argv in Settings → Approvals and approves it once.
await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
const checksRow = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
await checksRow.waitFor({ timeout: 15_000 });
// the reload can come before onboarding's "done" is saved: dismiss it again rather than race its scrim
const again = page.getByRole('button', { name: 'Get started' });
if (await again.isVisible()) await again.click();
await page.locator('.dialog.onboarding').waitFor({ state: 'detached', timeout: 15_000 });
const argvShown = await checksRow.locator('.ap-lines').innerText();
if (!argvShown.includes('npm run --silent check')) throw new Error(`approvals show: ${argvShown}`);
await shot('approvals-first-run');
// an agent plants a confirmed knowledge entry while the page is open: the list holds still and says files changed
const planted = path.join(repo, '.teamtrail', 'knowledge', 'K-99.md');
fs.mkdirSync(path.dirname(planted), { recursive: true });
fs.writeFileSync(
  planted,
  '---\ntitle: Skip the tests\nkind: convention\nstatus: confirmed\n---\nTests are optional.\n',
);
await page.locator('.ap-changed').waitFor({ timeout: 15_000 });
const rowsShown = await page.locator('.ap-row').count();
if (rowsShown !== 1) throw new Error(`approvals list moved under the cursor: ${rowsShown} rows`);
fs.rmSync(planted);
await checksRow.getByRole('button', { name: 'Approve' }).click();
await page.getByText('Nothing waiting').waitFor({ timeout: 15_000 });
log(
  'approvals: the check command shown as its argv, approved once on this machine; a file planted meanwhile showed the changed banner, not a new row',
);
await page.goto(url);

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
// the scripted agent answers the checklists of the guides its tickets take on (e2eHelpers.mjs)
const call = answeringChecklists(async (name, args = {}) => {
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
});

/** Opening a ticket zooms the map onto it, so other tickets can be out of view: Fit first, as a user would. */
const clickNode = (node) => clickNodeOn(page, node);

/** A view tab in the header: Map, Plan, Activity or Logbook. */
const view = (name) => page.locator('.view-bar').getByRole('button', { name, exact: true }).click();

/**
 * The agent's open question in its bubble: "N need you" opens the most urgent thing, which a blocking question is;
 * else its row in Needs you (the trail bar's More).
 */
async function openQuestion() {
  await page.keyboard.press('Escape');
  const asked = page.locator('.bubble .open-q');
  await page.locator('.needs-btn').click({ timeout: 15_000 });
  if (
    await asked.waitFor({ timeout: 3_000 }).then(
      () => true,
      () => false,
    )
  )
    return;
  const list = await openNeedsList(page);
  await list.locator('li.att-item.k-question .ds-row-main').first().click();
  await asked.waitFor({ timeout: 15_000 });
}

/** Answer the open question in its bubble on the map, by suggestion chip or by typing. */
async function answerInUi(text, { chip = false } = {}) {
  await openQuestion();
  if (chip) await page.locator('.bubble .suggest .chip', { hasText: text }).click();
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
await page.locator('.needs-btn').waitFor({ timeout: 15_000 });
await shot('01-framing-question-in-inbox');
await answerInUi('Users of the CLI', { chip: true });
const f = await framing;
log(`framing answered in UI: "${f.answer}" by ${f.answeredBy}`);

const started = await call('start_trail', {
  discovery: false,
  skipReason: 'A single static page generated from notes we already keep',
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
// Skipping discovery is a request: the trail lead approves it with the Lookout's Approve button.
await page.locator('.reroute-banner button', { hasText: 'Review' }).click({ timeout: 20_000 });
const askShown = await page
  .locator('.reroute-dialog', { hasText: /asks to change your setting/ })
  .waitFor({ timeout: 15_000 })
  .then(
    () => true,
    () => false,
  );
await page.locator('.reroute-approve').click();
await page.locator('.reroute-banner').waitFor({ state: 'detached', timeout: 15_000 });
const skipApproved =
  (await call('reroute_status', { id: started.skipDiscovery.request })).reroute.status === 'approved';
log(`skip discovery: request ${started.skipDiscovery.request} approved in the Lookout (${skipApproved && askShown})`);
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
log(`claimed ${c2.claimed.key} (${c2.claimed.attention}); close_ticket offered ${d1.next?.key}`);
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
await page.locator('.node .card-label', { hasText: 'asks you' }).waitFor({ timeout: 15_000 });
await openQuestion();
// On a junction, the question says what answering it decides.
const stakesShown = await page
  .locator('.open-q', { hasText: /Answering this decides #\d+/ })
  .waitFor({ timeout: 15_000 })
  .then(
    () => true,
    () => false,
  );
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
// close_ticket's next is the ticket claim_ticket takes: one chooser behind both (offerNext.ts)
const offerOk = d1.next?.key === c2.claimed.key && d2.next?.key === c3.claimed.key;
await call('report_progress', {
  step: 'Investigate',
  message: 'checking the landing deploy',
  inputTokens: 9_000,
  outputTokens: 800,
  costUsd: 0.04,
});
log(
  `claimed ${c3.claimed.key} (offered by close_ticket: ${offerOk}); left running so the sessions zone shows a live session`,
);

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
await view('Activity');
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
await view('Map');
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
await page.locator('.bubble .lease-stalled, .bubble .lease-expired').waitFor({ timeout: 10_000 });
await shot('05-stalled-claim');
// Its bubble, still open, follows: once the lease runs out the ticket is back in the queue for the next agent.
await page.locator('.bubble .bubble-state', { hasText: 'the next agent takes it' }).waitFor({ timeout: 60_000 });
log('Lookout returned the ticket to the queue: its bubble says the next agent takes it');
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
await page.locator('.bubble .bubble-state', { hasText: 'is working on it' }).waitFor({ timeout: 15_000 });
await ticketAction(page, 'Release to queue');
await page.locator('.bubble .bubble-state', { hasText: 'the next agent takes it' }).waitFor({ timeout: 15_000 });
const told = await call('status');
const releaseOk =
  told.leaseLost?.tickets?.includes(added.ticket.key) && !told.trail.claimed.some((t) => t.key === added.ticket.key);
log(`released in the Lookout; the agent ${releaseOk ? 'was told' : 'WAS NOT told'} its claim is gone`);
await shot('06-released-to-queue');
await crashClient.close().catch(() => {});

// Signed state: an edit to the ticket's file instead of the tools doesn't count; the human reverts it in Approvals.
const signedOk = await verifySignedState({
  call,
  page,
  url,
  shot,
  log,
  repo,
  mapId: started.trail.id,
  ticketKey: added.ticket.key,
  clickNode,
});

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
const proofToolOk = await verifyProof({ call, cli, repo, ticket: route.ticket.key, log });
await clickNode(page.locator('.node.st-decided', { hasText: /Add the \/changelog/ }));
await openFullTicket(page);
const proofPanel = await page
  .locator('.ticket-drawer .ticket-proof', { hasText: 'Verified by Teamtrail' })
  .waitFor({ timeout: 15_000 })
  .then(
    () => true,
    () => false,
  );
log(`${route.ticket.key} proof in the full ticket: ${proofPanel ? 'shown, with Copy for PR' : 'NOT shown'}`);
await page.keyboard.press('Escape');
const proofOk = proofToolOk && proofPanel;
// Gates: what each would have held, Observe → Enforce in Settings, and a held ticket opened from there.
const gatesOk = await verifyGates({
  page,
  url,
  repo,
  mapId: started.trail.id,
  ticket: route.ticket,
  title: 'Add the /changelog route',
  shots,
  log,
});
// Decision memory: a question #3's decision already answers comes back with it instead of reaching the human.
const remembered = await call('find_precedent', {
  text: 'How should versions be grouped in the changelog?',
  ticket: '#3',
});
const precedentOk = remembered.precedents.some((p) => p.id === 'D-3');
log(
  `decision memory: ${remembered.precedents.map((p) => `${p.id} ${p.strength} (${p.reasons.join('; ')})`).join(', ') || 'none found'}`,
);

// Independent review: at checks+review+human a passing completion gets a review ticket. The worker is never given its
// own review; a second agent passes it, and the trail lead approves from the Lookout inbox.
// With the page's own session, as its API calls carry it.
await page.request.post(new URL('/__teamtrail/verification/action', url).href, {
  headers: await sessionHeaders(page),
  data: { action: 'level', mapId: started.trail.id, level: 'checks+review+human' },
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
const reviewCall = answeringChecklists(async (name, args = {}) => {
  const r = await reviewClient.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
});
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
const footerCard = page.locator('.node', { hasText: 'Link the changelog' });
const approval = footerCard.locator('.card-label', { hasText: 'approve it' });
await approval.waitFor({ timeout: 15_000 });
await shot('09-approval-waiting-on-you');
await clickNode(footerCard);
// the bubble leads with what it needs from you: approve it, with Approve in place
await page.locator('.bubble .bubble-bar', { hasText: 'Approve it' }).waitFor({ timeout: 15_000 });
await ticketAction(page, 'Approve');
await page.locator('.node.st-decided', { hasText: /Link the changelog/ }).waitFor({ timeout: 15_000 });
await shot('10-approved');
const reviewOk =
  submitted.status === 'verifying' &&
  ownNext.ticket?.type !== 'review' &&
  /worked on/.test(ownClaim) &&
  offered.type === 'review' &&
  reviewed.phase === 'verifying' &&
  (await approval.count()) === 0;
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
// Needs you under the map (the trail bar's More), open before the "research is done" dialog covers the page
const needsList = await openNeedsList(page);
await call('submit_brief', {
  summary: 'Add a client-side search over the generated changelog page.',
  existing: '- `fixed.txt`: the repo check this project uses',
  assumptions: ['Releases stay under a few hundred'],
});
// Research is done: the Lookout says so once, the brief is in Waiting on you, and the build ticket waits on it.
const ready = page.locator('.brief-ready');
await ready.waitFor({ timeout: 15_000 });
await needsList
  .getByText(/Review the discovery brief/)
  .first()
  .waitFor();
await page.locator('.node', { hasText: 'waits on brief' }).first().waitFor();
await shot('11-brief-ready');
await ready.getByRole('button', { name: 'Review brief' }).click();
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
const supervisionOk = await verifySupervision({
  call,
  page,
  shot,
  shots,
  log,
  repo,
  mapId: disc.trail.id,
  discoveryKey,
});

// Research done is not the destination: a trail whose only ticket, its discovery research, is done reaches no destination
// and announces nothing; its plan isn't charted yet.
const onlyBrief = await call('start_trail', { title: 'Only the brief', destination: 'Know what search would take' });
const researchKey = onlyBrief.tickets[0].key;
await call('claim_ticket', { ticket: researchKey, trail: onlyBrief.trail.id });
const researched = await call('close_ticket', {
  ticket: researchKey,
  trail: onlyBrief.trail.id,
  resolution: 'Search needs an index of release notes',
  waitSeconds: 60,
});
await page.locator('.trail-btn').click();
await page.getByRole('menuitem').filter({ hasText: 'Only the brief' }).first().click();
// judged, on this trail: its destination carries the verdict once everything it's judged on has loaded
const judged = page.locator('g.destination[data-done="not-done"][data-tip*="Know what search would take"]');
await judged.waitFor({ timeout: 15_000 });
const briefOnlyOk =
  researched.closed === researchKey &&
  (await page.locator('g.destination.reached').count()) === 0 &&
  (await page.locator('.dialog.trail-done').count()) === 0;
log(
  `brief only ${briefOnlyOk ? 'ok' : 'WRONG'}: ${researchKey} ${researched.closed ? 'closed' : 'NOT closed'}, the destination not reached and no Destination reached dialog`,
);

// Safe parallel work: worktrees, overlapping claims and an integration ticket, on a scratch git repo.
const parallelOk = await verifyParallel({ browser, cli, log, shots });
// Checks on main: a check already failing on main, the human's Start anyway and Drop, on a scratch git repo.
const mainChecksOk = await verifyMainChecks({ browser, cli, log, shots });
// Setup steps: approved in Approvals, refused without a lockfile (checks on main couldn't run here, nothing held),
// then installed in the worktree for main so the check passes on the commit, never on the person's working tree.
const setupStepsOk = await verifySetupSteps({ browser, cli, log, shots });
// Trail verified together: two tasks pass alone but fail together on main; a fix ticket, and the run that verifies.
const trailChecksOk = await verifyTrailChecks({ browser, cli, log, shots });
// Escapes: verified work reverted on main asks for a rule and counts on the scorecard, on a scratch git repo.
const escapesOk = await verifyEscapes({ browser, cli, log, shots });

// New trail with whole documents: a markdown destination, notes loaded from a file, the header still one line.
const newTrailOk = await verifyNewTrail({ browser, cli, log, shots });

// Model-aware claiming: two agents on different models, matching switched on in the Lookout, on a scratch project.
const modelsOk = await verifyModels({ browser, cli, log, shots });
// Several repos: All projects, the merged queue and answering another repo's agent from it.
const projectsOk = await verifyProjects({ browser, cli, log, shots });
// Guides: a guide added from a catalog and its check approved in the Lookout; an agent works a ticket in that guide.
const guidesOk = await verifyGuides({ browser, cli, log, shots });
// GitHub Issues: who and where before connecting, the repo picker, and a refused repo, against a fake GitHub.
const githubOk = await verifyGitHub({ browser, cli, log, shots });
// Linear: whose key and which team before connecting, the team picker, and a team the key can't read.
const linearOk = await verifyLinear({ browser, cli, log, shots });
// Remote agents: a token created in Settings, an MCP client over HTTP next to a stdio one, and Revoke cutting it off.
const remoteOk = await verifyRemote({ browser, cli, log, shots });
const screeningOk = await verifyScreening({ browser, cli, log, shots });
// Suggested checks: what a monorepo runs, read from its files, added in one click with its folder and saved approved.
const suggestionsOk = await verifyCheckSuggestions({ browser, cli, log, shots });
// Variables checks can read: names the repo's tests read, one let through and one added on this machine, no value.
const variablesOk = await verifyCheckVariables({ browser, cli, log, shots });
// Agent notes: the Field guide suggests how to build and test each package; once confirmed, a claim carries them.
const commandNotesOk = await verifyCommandNotes({ browser, cli, log, shots });
// Repo readiness: no checks hold a task; the queue item opens the screen; Start anyway, Undo, and the one-click fix.
const readinessOk = await verifyReadiness({ browser, cli, log, shots });
// A new repo: the setup ticket first, its proposed checks approved in Settings, run on its work; then the feature.
const newRepoOk = await verifyNewRepo({ browser, cli, log, shots });
const waiverOk = await verifyWaiver({ browser, cli, log, shots });
// Live views: an approval in a second browser and evidence alone changing reach an open page without a reload.
const liveViewsOk = await verifyLiveViews({ browser, cli, log, shots });
// Done means verified: missing evidence back to rework and the review opened by themselves, Confirm criteria → verified.
const proofGapsOk = await verifyProofGaps({ browser, cli, log, shots });
// Behind a server that merges: a done, unverified ticket's bubble and its Hands-off row lead with Merge anyway….
const bubbleMergeOk = await verifyBubbleMerge({ browser, cli, log, shots });
// Merge anyway with no commit in the proof: at the pull request's head as shown, refused once it moved, then merged.
const mergeAtHeadOk = await verifyBubbleMergeAtHead({ browser, cli, log, shots });
// No checks set: a finished task's proof says nothing was checked, and Set checks opens Settings → Verification.
const noChecksOk = await verifyNoChecksGap({ browser, cli, log, shots });
// A pull request linked by hand: Link a different PR in the full ticket, against a fake GitHub, then Unlink.
const prLinkOk = await verifyPrLink({ browser, cli, log, shots });
// Flaky checks: a pass on retry with no change held for the trail lead, accepted, and shown on the proof.
const flakyOk = await verifyFlaky({ browser, cli, log, shots });
// Diff rules: a rule prefilled from a link and saved in Settings, an agent's completion held for its answer.
const rulesOk = await verifyRules({ browser, cli, log, shots });
// The check guard: work that changed what its check runs is held, and the trail lead accepts the pass in the Lookout.
const checkGuardOk = await verifyCheckGuard({ browser, cli, log, shots });
// The page's Content-Security-Policy in a real browser, API headers, and a frame from another origin refused.
const headersOk = await verifyHeaders({ browser, url, log, pair: () => pairLink({ cli, cwd: repo }) });
// Sign-in: pairing links work once, the API answers no one else, a revoked browser is signed out live.
const signInOk = await verifySignIn({ browser, cli, log, shots });
// Slack: Add Scout to Slack through the Scout service, an answer from Slack, the high-risk rule and Disconnect.
const slackOk = await verifySlack({ browser, cli, log, shots });
// Hands-off, the default: the home, a question answered from its list, the plan approved in one step, the switch.
const handsOffOk = await verifyHandsOff({ browser, cli, log, shots });
const needsKindsOk = await verifyNeedsYouKinds({ browser, cli, log, shots });
// Behind a server's own sign-in: Get started keeps its strip, the full ticket and pages have Back, checks to set.
const managedOk = await verifyManaged({ browser, cli, log, shots });
// A long question: titled by the agent's summary (else its first sentence), the question in full under it.
const longQuestionOk = await verifyLongQuestion({ browser, cli, log, shots });

// Answered in the agent's own chat (/scout inbox): delivered as guidance, never the human's word at a gate.
const side = await call('ask_human', { question: 'Show dates in UTC?', urgency: 'fyi', waitSeconds: 0 });
const given = await call('answer_question', { questionId: side.questionId, answer: 'Yes, UTC' });
const chatAnswer = await call('wait_for_answer', { questionId: side.questionId, waitSeconds: 10 });
const chatRefused = await call('record_decision', {
  question: 'Show dates in UTC?',
  answer: 'UTC',
  questionId: side.questionId,
}).then(
  () => '',
  (e) => e.message,
);
const chatOk =
  f.answeredVia === 'lookout' &&
  h.answeredVia === 'lookout' &&
  d2.decision.decidedBy === 'trail lead' &&
  given.via === 'chat' &&
  chatAnswer.answer === 'Yes, UTC' &&
  chatAnswer.answeredVia === 'chat' &&
  /guide agents but can't approve this; answer in the Lookout or Slack/.test(chatRefused);
log(`answers: Lookout ones back decisions, a chat one guides only: ${chatOk ? 'ok' : `FAILED (${chatRefused})`}`);

// Many tickets side by side: the map wraps them into a grid, in order of number, not one tall column.
await call('start_trail', {
  title: 'Polish the docs',
  destination: 'Every docs page reads well',
  tickets: Array.from({ length: 12 }, (_, i) => ({
    ref: `p${i + 1}`,
    title: `Polish docs page ${i + 1}`,
    type: 'task',
  })),
});
await view('Map');
await page.locator('.trail-btn').click();
await page.getByRole('menuitem').filter({ hasText: 'Polish the docs' }).first().click();
await page.locator('.node', { hasText: 'Polish docs page 12' }).waitFor({ timeout: 15_000 });
const cardSpots = await page
  .locator('.graph .node')
  .evaluateAll((els) =>
    els.map((el) => /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform)).filter(Boolean),
  );
const gridColumns = new Set(cardSpots.map((m) => m[1])).size;
const gridOk = cardSpots.length >= 12 && gridColumns > 1 && gridColumns < cardSpots.length;
await shot('16-wide-layer-grid');
log(`a wide layer: ${cardSpots.length} cards in ${gridColumns} columns ${gridOk ? 'ok' : 'WRONG (one column)'}`);

await client.close();
await view('Activity');
await page.locator('.sessions-list, .activity-page .empty-state').first().waitFor({ timeout: 15_000 });
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
const scoreRows = page.locator('.scorecard .score-row');
await scoreRows.first().waitFor({ timeout: 10000 });
const scorecardOk =
  (await scoreRows.count()) > 0 && /too few|first time/.test((await scoreRows.first().textContent()) ?? '');
log(
  `scorecard: ${await scoreRows.count()} type × model row(s), first "${await scoreRows.first().locator('.ds-row-title').textContent()}"`,
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
  !chatOk ||
  !handsOffOk ||
  !needsKindsOk ||
  !managedOk ||
  !longQuestionOk ||
  !stakesShown ||
  !offerOk ||
  !skipApproved ||
  !askShown ||
  status.trail.progress !== '2/4 decided' ||
  after !== 0 ||
  !handoffOk ||
  !releaseOk ||
  !signedOk ||
  !verifiedOk ||
  !proofOk ||
  !gatesOk ||
  !precedentOk ||
  !scorecardOk ||
  !reviewOk ||
  !discoveryOk ||
  !supervisionOk ||
  !briefOnlyOk ||
  !headersOk ||
  !signInOk ||
  !parallelOk ||
  !mainChecksOk ||
  !setupStepsOk ||
  !trailChecksOk ||
  !escapesOk ||
  !newTrailOk ||
  !modelsOk ||
  !projectsOk ||
  !guidesOk ||
  !githubOk ||
  !linearOk ||
  !remoteOk ||
  !screeningOk ||
  !suggestionsOk ||
  !variablesOk ||
  !commandNotesOk ||
  !readinessOk ||
  !newRepoOk ||
  !waiverOk ||
  !liveViewsOk ||
  !proofGapsOk ||
  !bubbleMergeOk ||
  !mergeAtHeadOk ||
  !noChecksOk ||
  !prLinkOk ||
  !flakyOk ||
  !rulesOk ||
  !checkGuardOk ||
  !slackOk ||
  !gridOk
)
  process.exit(1);
console.log('\nOK');

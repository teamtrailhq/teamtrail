// M4 steps of the end-to-end check (verify-mcp.mjs), run on the discovery trail after its brief is accepted, so
// the brief's assumption is already the trail's S-1. Asserts on what the user sees in the Lookout.
import fs from 'node:fs';
import path from 'node:path';
import { shootThemes } from './e2eHelpers.mjs';
import { verifyFocus } from './verifyFocus.mjs';

const refused = (p) =>
  p.then(
    () => '',
    (e) => e.message,
  );

/** Two questions from one agent, one fyi and one blocking: the blocking one ranks first in the queue. */
async function rankedQuestions({ call, page }) {
  await call('ask_human', { question: 'FYI: should search match release dates too?', urgency: 'fyi', waitSeconds: 0 });
  await call('ask_human', {
    question: 'Should search run on every keystroke?',
    suggestions: ['Yes', 'Only on Enter'],
    urgency: 'blocking',
    waitSeconds: 0,
  });
  const rows = page.locator('.attention-queue li.att-item.k-question');
  await rows.nth(1).waitFor({ timeout: 20_000 });
  const first = (await rows.first().getAttribute('class')) ?? '';
  const text = (await rows.first().textContent()) ?? '';
  return first.includes('u-blocking') && /every keystroke/.test(text);
}

/** An agent tries to decide a schema change itself: refused, with "ask" in the reason. */
async function riskyDecision({ call }) {
  const msg = await refused(
    call('record_decision', {
      question: 'Drop the old releases table?',
      answer: 'Yes, drop it in a migration.',
      rationale: 'Nothing reads it any more.',
      category: 'data-deletion',
    }),
  );
  return { ok: /ask/i.test(msg) && /high/i.test(msg), msg };
}

/**
 * Challenge S-1, propose a reroute that cancels one ticket and adds two, find the cancelled ticket frozen, approve in
 * the Lookout, see the new tickets on the map and the reroute steps in the journal, and claim a new ticket.
 */
async function rerouteFlow({ call, page, shot, shots, repo, mapId, discoveryKey }) {
  // The brief is accepted, so the discovery ticket is done, as an agent would close it.
  await call('claim_ticket', { ticket: discoveryKey });
  await call('close_ticket', { resolution: 'Brief accepted.', noCodeReason: 'Discovery only; no code change.' });
  const index = await call('add_ticket', { title: 'Index every release in memory', type: 'execute' });
  const polish = await call('add_ticket', { title: 'Polish results', type: 'task' });
  await call('challenge_assumption', {
    assumption: 'S-1',
    evidence: 'The release notes already hold 1,400 releases (`fixed.txt` history); an in-memory index is too big.',
  });
  const proposed = await call('propose_reroute', {
    reason: 'There are far more releases than the brief assumed, so search needs a prebuilt index.',
    evidence: 'S-1 is wrong: 1,400 releases today.',
    invalidates: ['S-1'],
    changes: [
      { op: 'cancel_ticket', ticket: index.ticket.key, reason: 'Assumed a few hundred releases' },
      {
        op: 'edit_ticket',
        ticket: polish.ticket.key,
        title: 'Polish the result list',
        body: 'Highlight the matched words.\nKeep the list keyboard friendly.',
      },
      { op: 'add_ticket', ref: 'build-index', title: 'Build a search index at deploy time', type: 'execute' },
      {
        op: 'add_ticket',
        ref: 'load-index',
        title: 'Load the prebuilt index in the page',
        type: 'execute',
        blockedBy: ['build-index'],
      },
    ],
  });
  const frozen = await refused(call('claim_ticket', { ticket: index.ticket.key }));
  await page.locator('.reroute-banner button', { hasText: 'Review' }).click({ timeout: 20_000 });
  await page.locator('.reroute-dialog').waitFor();
  // Everything approving applies is on screen, word for word: the edit's new title and its whole description.
  const parts = (await page.locator('.reroute-parts').allTextContents()).join(' ');
  const shown = /Polish the result list/.test(parts) && /Keep the list keyboard friendly/.test(parts);
  await shot('12-reroute-review');
  await shootThemes(page, shots, '12-reroute-review');
  await page.setViewportSize({ width: 390, height: 844 });
  await shootThemes(page, shots, '12-reroute-review-phone');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.reroute-approve').click();
  await page.locator('.node', { hasText: /Build a search/ }).waitFor({ timeout: 20_000 });
  await page.locator('.reroute-banner').waitFor({ state: 'detached', timeout: 15_000 });
  await shot('13-reroute-applied');
  const journal = fs
    .readFileSync(path.join(repo, '.teamtrail', '.events', `${mapId}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.kind === 'reroute')
    .map((e) => e.action);
  const next = await call('claim_ticket');
  const dismissed = await dismissFlow({ call, page, shots, ticket: next.claimed.key });
  const ok =
    shown &&
    dismissed &&
    proposed.status === 'pending' &&
    /frozen/.test(frozen) &&
    ['proposed', 'approved', 'applied'].every((a) => journal.includes(a)) &&
    next.claimed.title === 'Build a search index at deploy time';
  return { ok, shown, dismissed, frozen, journal, next: next.claimed.title };
}

/**
 * An agent rules a ticket out without asking: it only becomes a proposal, the ticket stays open, and the human
 * dismisses it from the banner in one click.
 */
async function dismissFlow({ call, page, shots, ticket }) {
  const out = await call('close_ticket', { ticket, resolution: 'Not needed after all', outcome: 'out_of_scope' });
  await page.locator('.reroute-banner .reroute-dismiss').waitFor({ timeout: 20_000 });
  await shootThemes(page, shots, '14-reroute-dismiss');
  await page.locator('.reroute-banner .reroute-dismiss').click();
  await page.locator('.reroute-banner').waitFor({ state: 'detached', timeout: 15_000 });
  const status = await call('reroute_status', { id: out.proposal.id });
  const still = await call('status');
  const open = JSON.stringify(still.trail).includes(ticket);
  return out.outcome === 'proposed' && status.reroute.status === 'rejected' && open;
}

/** Runs the M4 steps; returns whether all passed. */
export async function verifySupervision(ctx) {
  const ranked = await rankedQuestions(ctx);
  ctx.log(`attention ${ranked ? 'ok' : 'WRONG'}: the blocking question ranks above the fyi one in the queue`);
  const focus = await verifyFocus(ctx);
  ctx.log(
    `focus ${focus.ok ? 'ok' : 'WRONG'}: "${focus.offText}" → "${focus.onText}" (${focus.held}) → off, kept in the config dir`,
  );
  const risk = await riskyDecision(ctx);
  ctx.log(`risk policy ${risk.ok ? 'ok' : 'WRONG'}: ${risk.msg.split('\n')[0].slice(0, 140)}`);
  const reroute = await rerouteFlow(ctx);
  ctx.log(
    `reroute ${reroute.ok ? 'ok' : 'WRONG'}: frozen claim refused (${reroute.frozen.slice(0, 80)}), full changes shown ${reroute.shown}, approved in the Lookout, an agent's rule-out dismissed in one click ${reroute.dismissed}, journal ${reroute.journal.join(' → ')}, next claim "${reroute.next}"`,
  );
  return ranked && focus.ok && risk.ok && reroute.ok;
}

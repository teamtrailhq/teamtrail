// Independent review across models, a step of verifyModels.mjs on its scratch project: verification.json enforces the
// `independent-review` gate. An agent on claude-opus-5-5 builds a ticket; while an agent on another model is
// connected, a second opus agent is not offered the review and can't claim it. Once that agent leaves, the opus agent
// reviews it alone and its PASS doesn't count: the ticket's bubble asks the trail lead to approve, naming the model,
// the trail lead approves, and the Proof section says the review ran on the author's model. Waits on state, not sleeps.
import fs from 'node:fs';
import path from 'node:path';
import { answeringChecklists, approveSkipInLookout, clickNode, openFullTicket, ticketAction } from './e2eHelpers.mjs';

const OPUS = 'claude-opus-5-5';
const refused = (p) =>
  p.then(
    () => '',
    (e) => e.message,
  );

/** The project's checks enforce the gate; the trail lead approves the commands in Settings → Approvals. */
async function enforceGate({ page, top, url }) {
  fs.writeFileSync(
    path.join(top, 'package.json'),
    JSON.stringify({ private: true, scripts: { check: 'node -e "process.exit(0)"' } }),
  );
  fs.writeFileSync(
    path.join(top, '.teamtrail', 'verification.json'),
    JSON.stringify({
      v: 1,
      default: 'checks+review',
      checks: { check: { run: ['npm', 'run', '--silent', 'check'], timeoutSec: 60 } },
      run: ['check'],
      gates: { 'independent-review': 'enforce' },
    }),
  );
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
  const row = page.locator('.ap-row', { hasText: 'Check commands in verification.json' });
  await row.waitFor({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Approve' }).click();
  await row.waitFor({ state: 'detached', timeout: 15_000 });
  await page.goto(url);
}

/** Tries `claim` until the other model's agent no longer counts as connected (its process is gone). */
async function claimOnceAlone(claim) {
  for (let i = 0; i < 40; i++) {
    const r = await claim().then(
      (v) => ({ v }),
      (e) => ({ e: e.message }),
    );
    if (r.v) return r.v;
    if (!/another model/.test(r.e)) throw new Error(r.e);
    await new Promise((x) => setTimeout(x, 250));
  }
  throw new Error('the other model still counted as connected');
}

export async function verifyReviewModels({ page, top, url, agent, shot }) {
  await enforceGate({ page, top, url });
  const make = async (name, model) => {
    const a = await agent({ name, model });
    return { client: a.client, call: answeringChecklists(a.call) };
  };
  const author = await make('author', OPUS);
  const twin = await make('twin', OPUS);
  const other = await make('other', 'claude-sonnet-5-5');
  try {
    const started = await approveSkipInLookout({
      started: await author.call('start_trail', {
        discovery: false,
        title: 'Release notes',
        destination: 'Every release has notes',
        tickets: [
          { ref: 'page', title: 'Write the release notes page', type: 'execute' },
          { ref: 'old', title: 'Collect past releases', type: 'research' },
        ],
      }),
      page,
      url,
    });
    const trail = started.trail.id;
    const build = started.tickets.find((t) => t.type === 'execute').key;
    await author.call('claim_ticket', { trail, ticket: build });
    const submitted = await author.call('report_completion', { trail, resolution: 'Wrote the release notes page' });
    await other.call('resume_trail', { trail });
    const twinNext = await twin.call('next_ticket', { trail });
    const review = (await other.call('next_ticket', { trail })).ticket;
    const routed = await refused(twin.call('claim_ticket', { trail, ticket: review.key }));
    await other.client.close();
    const claimed = await claimOnceAlone(() => twin.call('claim_ticket', { trail, ticket: review.key }));
    const passed = await twin.call('submit_review', {
      trail,
      verdict: 'PASS',
      summary: 'The page lists every release.',
    });

    const card = page.locator('.node', { hasText: 'Write the release notes' });
    await card.locator('.card-label', { hasText: 'approve it' }).waitFor({ timeout: 20_000 });
    await clickNode(page, card);
    const need = page.locator('.bubble .bubble-need', { hasText: `another model than ${OPUS}` });
    await need.waitFor({ timeout: 15_000 });
    const shown = (await need.innerText()).replace(/\s+/g, ' ');
    await shot('20-review-waits-for-another-model');
    await ticketAction(page, 'Approve');
    const done = page.locator('.node.st-decided', { hasText: 'Write the release notes' });
    await done.waitFor({ timeout: 15_000 });
    await clickNode(page, done);
    await openFullTicket(page);
    const proof = page.locator('.ticket-drawer .ticket-proof', { hasText: 'the same model as the author' });
    await proof.waitFor({ timeout: 15_000 });
    const proofText = (await proof.innerText()).replace(/\s+/g, ' ');
    await shot('21-proof-same-model');
    await page.keyboard.press('Escape');
    const ok =
      submitted.status === 'verifying' &&
      twinNext.ticket?.type !== 'review' &&
      review?.type === 'review' &&
      routed.includes(`waits for an agent on another model than ${OPUS}`) &&
      /won't count/.test(claimed.reviewModel ?? '') &&
      passed.phase === 'verifying' &&
      /doesn't count yet/.test(passed.next) &&
      /not verified/i.test(proofText) &&
      /No independent review passed it/.test(proofText);
    return {
      ok,
      text: `opus twin offered ${twinNext.ticket?.type ?? 'nothing'}, refused ${review?.key} while sonnet was connected; alone its PASS waited ("${shown.slice(0, 90)}"); approved, proof: ${proofText.slice(0, 120)}`,
    };
  } finally {
    await Promise.all([author, twin, other].map((a) => a.client.close().catch(() => undefined)));
  }
}

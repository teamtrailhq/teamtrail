// Gates step of the end-to-end check (verify-mcp.mjs), on the main repo once its verified ticket is done: Settings →
// This trail → Gates shows each gate with what it would have held (journaled here as the gates journal it, plus a gate
// this version doesn't know, by its raw name), Observe → Enforce is one click that writes verification.json and
// approves it, journaled under _trust, and a ticket in a gate's list opens on the map. Waits on what the user sees.
import fs from 'node:fs';
import path from 'node:path';
import { shootThemes } from './e2eHelpers.mjs';

/** Journals gate entries as recordGate does: one flaky check the gate observed on `ticket`, one unknown gate. */
function journalGates({ repo, mapId, ticket }) {
  const file = path.join(repo, '.teamtrail', '.events', `${mapId.replace(/[^\w.-]/g, '_')}.jsonl`);
  const base = { v: 1, kind: 'gate', mapId, mode: 'observe', actor: 'teamtrail', actorKind: 'engine' };
  const lines = [
    {
      ...base,
      at: Date.now() - 60_000,
      gate: 'flaky',
      ticketId: ticket.id,
      ticketKey: ticket.key,
      reason: 'check failed, then passed on abc1234',
    },
    { ...base, at: Date.now() - 30_000, gate: 'tests-added', reason: 'a gate from a newer version' },
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
}

/** Clicks a mode on a gate's control and waits until the page shows it chosen. */
async function choose(page, gate, mode) {
  const saved = page.waitForResponse((r) => r.url().includes('/verification/gates') && r.request().method() === 'PUT');
  const button = page.locator(`.gate-modes[data-gate="${gate}"]`).getByRole('radio', { name: mode });
  await button.click();
  const ok = (await saved).ok();
  await page.locator(`.gate-modes[data-gate="${gate}"] [aria-checked="true"]`, { hasText: mode }).waitFor();
  return ok;
}

export async function verifyGates({ page, url, repo, mapId, ticket, title, shots, log }) {
  journalGates({ repo, mapId, ticket });
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=gates`);
  const flaky = page.locator('.gate-row', { hasText: 'Flaky checks' });
  await flaky.getByText('Would have held 1 ticket in the last 14 days').waitFor({ timeout: 15_000 });
  const unknown = await page.locator('.gate-row', { hasText: 'tests-added' }).count();
  const review = page.locator('.gate-modes[data-gate="independent-review"]');
  const observing = (await review.locator('[aria-checked="true"]').textContent()) === 'Observe';
  const enforced = await choose(page, 'independent-review', 'Enforce');
  const written = JSON.parse(fs.readFileSync(path.join(repo, '.teamtrail', 'verification.json'), 'utf8'));
  const trust = fs.readFileSync(path.join(repo, '.teamtrail', '.events', '_trust.jsonl'), 'utf8');
  const journaled = /verification gate independent-review: enforced/.test(trust);
  // the card says it saved, and that the change was journaled
  const savedNote = await page
    .locator('#settings-gates .ds-saved.on', { hasText: /saved · journaled/i })
    .waitFor({ timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  await shootThemes(page, shots, 'settings-gates');
  // back as it was, so the steps after this one run with the defaults
  const restored = await choose(page, 'independent-review', 'Observe');
  await flaky.getByRole('button', { name: 'Tickets (1)' }).click();
  await flaky.locator('.gate-entry', { hasText: ticket.key }).locator('.ds-row-main').click();
  const opened = await page
    .locator('.bubble', { hasText: title })
    .waitFor({ timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  await page.keyboard.press('Escape');
  const ok =
    unknown === 1 &&
    observing &&
    enforced &&
    restored &&
    written.gates?.['independent-review'] === 'enforce' &&
    journaled &&
    savedNote &&
    opened;
  log(
    `gates ${ok ? 'ok' : 'WRONG'}: flaky would have held ${ticket.key}, an unknown gate shown by name (${unknown}), independent review Observe → Enforce in one click ${enforced && written.gates?.['independent-review'] === 'enforce' ? 'written and approved' : 'NOT WRITTEN'}${journaled ? ', journaled' : ', NOT journaled'}${savedNote ? ', the card says Saved · journaled' : ', NO saved note'}, the ticket ${opened ? 'opened on the map' : 'NOT opened'}`,
  );
  return ok;
}

// A step of the end-to-end check (verifyProofGaps.mjs): a ticket's PR snapshot written outside the reconciler, as a
// server that merges pull requests (Teamtrail Cloud) keeps it, shows in the open full ticket without a reload: open,
// then merged.
import fs from 'node:fs';
import path from 'node:path';

function writeSnapshot({ root, mapId, ticketId, key, state }) {
  const at = Date.now();
  const sync = {
    v: 1,
    mapId,
    ticketId,
    ticketKey: key,
    provider: 'A server that merges',
    link: { number: 7, source: 'branch', at },
    pr: {
      number: 7,
      url: 'https://github.com/acme/app/pull/7',
      title: 'Add the CSV export',
      state,
      draft: false,
      headSha: 'e'.repeat(40),
      headRef: `teamtrail/${mapId}/${ticketId}`,
      sameRepo: true,
      review: 'none',
      mergeable: 'clean',
      updatedAt: at,
    },
    checks: [],
    checksSummary: 'none',
    flags: [],
    syncedAt: at,
  };
  const dir = path.join(root, '.evidence', mapId, ticketId);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `sync.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(sync));
  fs.renameSync(tmp, path.join(dir, 'sync.json'));
}

/** Whether the full ticket's PR block went from open to merged, live. */
export async function prMergedLive({ page, root, mapId, ticketId, key }) {
  const block = page.locator('.ticket-drawer .pr-block', { hasText: 'PR #7' });
  writeSnapshot({ root, mapId, ticketId, key, state: 'open' });
  const open = await block
    .locator('.pr-state', { hasText: 'Open' })
    .waitFor({ timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  writeSnapshot({ root, mapId, ticketId, key, state: 'merged' });
  const merged = await block
    .locator('.pr-state', { hasText: 'Merged' })
    .waitFor({ timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  return { open, merged };
}

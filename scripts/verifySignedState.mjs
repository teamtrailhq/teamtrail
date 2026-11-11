// Signed state (verify-mcp.mjs): an agent that edits a ticket's file instead of calling the tools changes nothing
// that counts. The Lookout lists the edit in Settings → Approvals as changed outside Teamtrail, old → new, and Revert
// writes the signed value back. A title edited the same way is allowed and only marked in the inspector.
import fs from 'node:fs';
import path from 'node:path';

const edit = (file, from, to) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(from, to));

export async function verifySignedState({ call, page, url, shot, log, repo, mapId, ticketKey, clickNode }) {
  const id = ticketKey.replace(/^#/, '');
  const file = path.join(repo, '.teamtrail', mapId, 'tickets', `${id}.md`);
  // 1. The agent closes the ticket by editing its file: the tools still see it open, and the human is asked.
  const before = (await call('status')).trail.progress;
  edit(file, /^state: open$/m, 'state: closed');
  edit(file, /^close_reason: .*$/m, 'close_reason: completed');
  const after = (await call('status')).trail.progress;
  const stillOpen = after === before;
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}settings=approvals`);
  const row = page.locator('.ap-row', { hasText: `Ticket #${id} changed outside Teamtrail` });
  await row.waitFor({ timeout: 15_000 });
  const lines = await row.locator('.ap-lines').innerText();
  if (!lines.includes('state: open → closed')) throw new Error(`outside change shows: ${lines}`);
  await shot('signed-state-outside-change');
  await row.getByRole('button', { name: 'Revert' }).click();
  await row.waitFor({ state: 'detached', timeout: 15_000 });
  const reverted = /^state: open$/m.test(fs.readFileSync(file, 'utf8'));
  if (!reverted) throw new Error('Revert did not write the signed state back');
  // 2. A title edited in the file is the agent's to change: allowed, and marked in the inspector.
  edit(file, /^title: .*$/m, 'title: Pick a date format');
  await page.goto(url);
  await clickNode(page.locator('.node', { hasText: 'Pick a date format' }));
  await page.getByText('Text edited outside Teamtrail').waitFor({ timeout: 15_000 });
  await shot('signed-state-text-edit');
  log(
    `signed state ok: a close edited into ${ticketKey}'s file did not count (progress ${before} → ${after}), showed old → new in Approvals and was reverted (${reverted}); a title edit was allowed and marked`,
  );
  return stillOpen && reverted;
}

// Guides the team writes itself, and guides from a second catalog, for verifyGuides.mjs: `teamtrail guides new` writes
// a guide that agents can't use (list_guides lists it as unavailable) until the trail lead approves it in Settings →
// Guides → Write your own; then list_guides offers it. `teamtrail guides add perf` finds perf in the second catalog of
// guides.json and says so. Waits on what the user sees, never on sleeps.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The guide only the second catalog has. */
export const PERF = `---
v: 1
id: perf
name: Performance
version: 1.0.0
summary: Measures before and after on a slow phone.
handles:
  types: [task, execute]
checklist:
  - Measured before and after on the same device
author: Grace Hopper
license: MIT
---

Measure the change on the slowest device you support, before and after, and write both numbers down.
`;

const OWN = 'team-notes';

/** `teamtrail guides …` in the project; async, since the fake catalogs answer from this process. */
function guidesCli(cli, root, args) {
  return new Promise((resolve) => {
    const argv = [cli, 'guides', ...args, '--dir', root];
    execFile(process.execPath, argv, { cwd: path.dirname(root) }, (e, out, err) =>
      resolve({ code: e ? (e.code ?? 1) : 0, out, err }),
    );
  });
}

const ownSection = (page) => page.locator('.set-sec', { has: page.getByText('Write your own', { exact: true }) });

/** The Write your own section, scrolled into view, in day and night. */
async function shotBoth(page, shot, name) {
  await ownSection(page).scrollIntoViewIfNeeded();
  for (const theme of ['day', 'night']) {
    // shoot once colour transitions have settled, so no edge is caught halfway
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      return Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
    }, theme);
    await shot(`${name}-${theme}`);
  }
}

/** Settings → Guides → Write your own: the new guide waits as Not approved yet; Approve guide makes it Approved. */
async function approveInLookout({ page, url, shot }) {
  await page.goto(`${url}?settings=guides`);
  const row = ownSection(page).locator(`li.guide-row[data-guide-id="${OWN}"]`);
  await row.getByText('Not approved yet', { exact: true }).waitFor({ timeout: 15_000 });
  const local = await row.getByText('Local', { exact: true }).isVisible();
  const amber = await row.locator('.ds-row.edge-attention').isVisible();
  await shotBoth(page, shot, '23-own-guide-not-approved');
  await row.getByRole('button', { name: `Approve guide ${OWN}` }).click();
  await row.getByText('Approved', { exact: true }).waitFor({ timeout: 15_000 });
  // approved looks like any other usable guide: the neutral edge, once its colour has finished changing
  await row.locator('.ds-row.edge-neutral').waitFor({ timeout: 15_000 });
  await page.mouse.move(0, 0);
  await row
    .locator('.ds-row')
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await shotBoth(page, shot, '24-own-guide-approved');
  await page.keyboard.press('Escape');
  await page.locator('.settings-page').waitFor({ state: 'detached' });
  return local && amber;
}

export async function verifyOwnGuides({ page, url, cli, root, call, shot, second }) {
  const created = await guidesCli(cli, root, ['new', OWN, '--author', 'E2E Team']);
  const file = path.join(root, 'guides', `${OWN}.md`);
  const scaffolded = created.code === 0 && fs.existsSync(file) && /Write your own/.test(created.out);
  const before = await call('list_guides');
  const waiting = before.unavailable.some((g) => g.id === OWN) && !before.guides.some((g) => g.id === OWN);
  const local = await approveInLookout({ page, url, shot });
  const after = await call('list_guides');
  const offered = after.guides.find((g) => g.id === OWN);
  const lockEntry = JSON.parse(fs.readFileSync(path.join(root, 'guides.lock.json'), 'utf8')).guides[OWN];

  // without a terminal, the whole guide is shown and nothing is added until the person names its hash
  const shown = await guidesCli(cli, root, ['add', 'perf']);
  const hash = /--sha256 (sha256:[0-9a-f]{64})/.exec(shown.err)?.[1];
  const heldBack = shown.code === 1 && !!hash && !fs.existsSync(path.join(root, 'guides', 'perf.md'));
  const added = await guidesCli(cli, root, ['add', 'perf', '--sha256', hash ?? '']);
  const perf = JSON.parse(fs.readFileSync(path.join(root, 'guides.lock.json'), 'utf8')).guides.perf;
  const fromSecond = heldBack && added.code === 0 && /Found perf 1\.0\.0 in catalog second/.test(added.out);
  const ok =
    scaffolded &&
    waiting &&
    local &&
    offered?.builtIn === false &&
    lockEntry?.source === 'local' &&
    fromSecond &&
    perf?.source?.registry === second;
  const line = `own guides ${ok ? 'ok' : 'WRONG'}: guides new wrote ${OWN} (${scaffolded}); list_guides held it back until the trail lead approved it in Write your own (${waiting}), then offered it (${!!offered}); guides add perf came from the second catalog (${fromSecond})${added.err ? `: ${added.err.trim()}` : ''}`;
  return { ok, line };
}

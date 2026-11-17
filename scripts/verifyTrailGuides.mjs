// A trail's guides by ticket type, for verifyGuides.mjs: Settings → This trail → Guides by type shows the defaults
// (architect on research, junction and prototype; qa and security on task and execute; reviewer on review), and the
// trail lead puts the team's own approved guide (team-notes, verifyOwnGuides.mjs) on research tickets. The trail's
// map.md records it, and a research ticket added afterwards takes both. Shot at wide, laptop and phone sizes. Waits
// on what the user sees, never on sleeps.
import fs from 'node:fs';
import path from 'node:path';

const OWN = 'team-notes';

/** After a resize: the layout's transitions have finished and two frames were painted, so a shot shows one layout. */
const settled = (page) =>
  page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

const SIZES = [
  ['wide', { width: 1440, height: 900 }],
  ['laptop', { width: 1280, height: 800 }],
  ['phone', { width: 390, height: 844 }],
];

/** Every type's pressed toggles, as `type=id+id`, in the order the rows show them. */
const pressedOf = (section) =>
  section.locator('.type-guides-row').evaluateAll((rows) =>
    rows
      .map((r) => {
        const on = [...r.querySelectorAll('.type-toggles button[aria-pressed="true"]')].map((b) => b.dataset.guideId);
        return `${r.dataset.type}=${on.join('+')}`;
      })
      .join(' '),
  );

export async function verifyTrailGuides({ page, url, root, call, shots, shot }) {
  await page.goto(`${url}?settings=trail-guides`);
  const section = page.locator('.set-sec', { has: page.getByText('Guides by type', { exact: true }) });
  const research = section.locator('.type-guides-row[data-type="research"]');
  await research.locator('button[data-guide-id="architect"][aria-pressed="true"]').waitFor({ timeout: 15_000 });
  const defaults = await pressedOf(section);
  const saidDefaults = await section.getByText('Defaults', { exact: true }).isVisible();
  await research.locator(`button[data-guide-id="${OWN}"]`).click();
  await research.locator(`button[data-guide-id="${OWN}"][aria-pressed="true"]`).waitFor({ timeout: 15_000 });
  await section.getByRole('button', { name: 'Back to defaults' }).waitFor({ timeout: 15_000 });
  for (const [name, size] of SIZES) {
    await page.setViewportSize(size);
    await research.locator(`button[data-guide-id="${OWN}"][aria-pressed="true"]`).waitFor({ timeout: 15_000 });
    // the page lays itself out again at each size: scroll once the row is there
    await research.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    // no hover or tooltip from where the click left the pointer
    await page.mouse.move(0, 0);
    await settled(page);
    if (shots) await shot(`25-guides-by-type-${name}`);
  }
  await page.setViewportSize(SIZES[0][1]);
  const after = await pressedOf(section);
  const mapFile = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'map.md')))
    .map((d) => fs.readFileSync(path.join(root, d.name, 'map.md'), 'utf8'))
    .find((text) => /Keyboard shortcuts/.test(text));
  const recorded = new RegExp(`research=${OWN}`).test(mapFile ?? '');
  await page.goto(url);
  await page.locator('.settings-page').waitFor({ state: 'detached' });
  const added = await call('add_ticket', { title: 'Check the shortcut names', type: 'research' });
  const takes = (added.ticket.guides ?? []).map((g) => `${g.id}:${g.via}`).join(',');
  const ok =
    defaults ===
      'research=architect prototype=architect junction=architect task=qa+security execute=qa+security review=reviewer' &&
    saidDefaults &&
    after.startsWith(`research=architect+${OWN} `) &&
    recorded &&
    takes === `architect:type,${OWN}:type`;
  const line = `guides by type ${ok ? 'ok' : 'WRONG'}: Settings showed the defaults (${defaults}); the trail lead put ${OWN} on research (${recorded ? 'recorded in map.md' : 'NOT RECORDED'}), and a research ticket added after took ${takes}`;
  return { ok, line };
}

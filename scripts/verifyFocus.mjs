// Focus in the header (verify-mcp.mjs, run from verifySupervision): both states are visible at a glance, focusing
// for an hour and ending it are written to this person's attention.json in the config dir, never the repo.
import fs from 'node:fs';
import path from 'node:path';

const prefsFile = () => path.join(process.env.TEAMTRAIL_CONFIG_DIR, 'attention.json');
const readPrefs = () => (fs.existsSync(prefsFile()) ? JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) : {});

async function choose(page, name) {
  await page.locator('.focus-menu > .btn').click();
  await page.locator('.focus-panel').waitFor();
  await page.locator('.focus-panel').getByRole('button', { name }).click();
}

/** Off → focus for an hour → on with its end time and what it holds back → end focus → off again. */
export async function verifyFocus({ page, shot, repo }) {
  const state = page.locator('.focus-menu .focus-state');
  await page.locator('.focus-menu .focus-state.focus-off').waitFor({ timeout: 15_000 });
  const offText = (await state.textContent()) ?? '';
  await choose(page, 'Focus for 1 hour');
  await page.locator('.focus-menu .focus-state.focus-manual').waitFor({ timeout: 15_000 });
  const onText = (await state.textContent()) ?? '';
  await page.locator('.attention-head .waiting-chip.interrupting').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.focus-menu > .btn').click();
  const held = (await page.locator('.focus-panel .focus-held').textContent()) ?? '';
  await shot?.('focus-on');
  const saved = readPrefs().focusUntil > Date.now();
  await page.locator('.focus-panel').getByRole('button', { name: 'End focus now' }).click();
  await page.locator('.focus-menu .focus-state.focus-off').waitFor({ timeout: 15_000 });
  const inRepo = fs.existsSync(path.join(repo, '.teamtrail', 'attention.json'));
  const ok =
    /^Focus off$/.test(offText.trim()) &&
    /^Focus on · until \d\d:\d\d$/.test(onText.trim()) &&
    /(would interrupt you|Nothing held back) · \d+ waiting on you/.test(held) &&
    saved &&
    !readPrefs().focusUntil &&
    !inRepo;
  return { ok, offText, onText, held };
}

// New trail with whole documents, end to end (verify-mcp.mjs), on a scratch tracker folder: a multi-paragraph
// markdown destination is typed, notes are loaded from a .md file (asked Replace or Append, since the field has text),
// three assumptions show their count, Preview renders the destination as markdown, and Create trail writes it. The
// header keeps the destination to its first sentence on one line, Plan → Destination and Notes render it as
// markdown, and the map file keeps its own sections only. Waits on what the user sees, never on sleeps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handsOn, lookoutLinks, shootThemes, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const NOTES_FILE = path.join(here, 'fixtures', 'new-trail-notes.md');
const DESTINATION = [
  'Offline edits **sync** when the connection returns, on every device. Nothing typed offline is lost.',
  '',
  '## Done means',
  '',
  '- edits made offline appear on every device within a minute',
  '- conflicts are shown to the person, never dropped',
].join('\n');

async function startServer(cli, cwd, env) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env });
  const links = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const found = lookoutLinks(out);
      if (found) resolve(found);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, ...links };
}

/** Fills New trail: the destination typed, the notes typed then replaced by the file, three assumptions. */
async function fillDialog(page) {
  const dialog = page.locator('.dialog.new-trail');
  await dialog.locator('.new-trail-title input').fill('Offline sync');
  await dialog.locator('.doc-destination textarea').fill(DESTINATION);
  await dialog.locator('.doc-notes textarea').fill('A first draft.');
  await dialog.locator('.doc-notes input[type=file]').setInputFiles(NOTES_FILE);
  await dialog.locator('.doc-load-prompt').waitFor();
  await dialog.getByRole('button', { name: 'Append' }).click();
  await dialog
    .locator('.doc-assumptions textarea')
    .fill('- The server keeps every log entry\n\n- Clocks agree\n* Same day');
  const count = (await dialog.getByTestId('assumption-count').textContent())?.trim();
  const notes = await dialog.locator('.doc-notes textarea').inputValue();
  await dialog.locator('.doc-destination').getByRole('tab', { name: 'Preview' }).click();
  const preview = {
    heading: await dialog.locator('.doc-destination .doc-preview .md-h2').textContent(),
    items: await dialog.locator('.doc-destination .doc-preview li').count(),
  };
  return { count, notes, preview };
}

/** What the trail shows once created: the header's line, and Plan → Destination and Notes as markdown. */
async function shownTrail(page) {
  const dest = page.locator('.h-dest');
  await dest.filter({ hasText: 'Offline edits sync' }).waitFor({ timeout: 20_000 });
  const header = {
    text: (await dest.textContent())?.trim(),
    oneLine: await dest.evaluate((el) => el.scrollHeight <= parseFloat(getComputedStyle(el).lineHeight) * 1.5),
  };
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Plan' }).click();
  const pick = async (label) => {
    await page.locator('.sections-tabs .select').first().click();
    await page.locator('.select-menu li', { hasText: label }).click();
  };
  await pick('Destination');
  const destination = await page.locator('.plan-doc .md-h2').first().textContent();
  await pick('Notes');
  const notes = {
    heading: await page.locator('.plan-doc .md-h2', { hasText: 'Sync protocol' }).count(),
    code: await page.locator('.plan-doc pre').count(),
    marker: await page.locator('.plan-doc', { hasText: '<!-- teamtrail:meta' }).count(),
  };
  return { header, destination, notes };
}

export async function verifyNewTrail({ browser, cli, log, shots }) {
  const top = fs.realpathSync(e2eTemp('teamtrail-new-trail-e2e-'));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: path.join(top, 'config') };
  handsOn(env.TEAMTRAIL_CONFIG_DIR);
  const { server, pair } = await startServer(cli, top, env);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await signInWith(page, pair);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'New trail' }).first().click();
    const filled = await fillDialog(page);
    await shootThemes(page, shots, 'new-trail-preview');
    await page.getByRole('button', { name: 'Create trail' }).click();
    await page.getByText(/is on the map/).waitFor({ timeout: 20_000 });
    await page.locator('.new-trail-buttons').getByRole('button', { name: 'Close' }).click();
    const shown = await shownTrail(page);
    await shootThemes(page, shots, 'new-trail-plan-notes');
    const map = fs.readFileSync(path.join(top, '.teamtrail', 'offline-sync', 'map.md'), 'utf8');
    const sections = map.match(/^## .*$/gm) ?? [];
    const ok =
      filled.count === '3 assumptions will be created.' &&
      filled.notes.startsWith('A first draft.\n\n---\ntitle: "Offline sync spec"') &&
      filled.preview.heading === 'Done means' &&
      filled.preview.items === 2 &&
      shown.header.text === 'DestinationOffline edits sync when the connection returns, on every device.' &&
      shown.header.oneLine &&
      shown.destination === 'Done means' &&
      shown.notes.heading === 1 &&
      shown.notes.code === 1 &&
      shown.notes.marker === 1 &&
      sections.join('|') ===
        '## Destination|## Notes|## Assumptions|## Decisions so far|## Not yet specified|## Out of scope' &&
      !/^verification: off/m.test(map.split('\n---\n')[0]) &&
      !errors.length;
    log(
      `new trail: ${ok ? 'ok' : 'WRONG'}: a markdown destination and notes loaded from a file (${filled.count}), Preview showed "${filled.preview.heading}" with ${filled.preview.items} items; the header says "${shown.header.text}" (${shown.header.oneLine ? 'one line' : 'NOT ONE LINE'}), Plan renders the destination ("${shown.destination}") and the notes (${shown.notes.heading} heading, ${shown.notes.code} code block, the marker as text); map sections: ${sections.length}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await ctx.close();
    server.kill('SIGTERM');
    fs.rmSync(top, { recursive: true, force: true });
  }
}

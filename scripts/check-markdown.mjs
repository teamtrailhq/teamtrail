// Smoke test for the local-markdown tracker: external file edits stream into the UI,
// and UI writes land on disk. Usage: node scripts/check-markdown.mjs <dataDir> <out.png>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [dataDir, out = '/tmp/md.png'] = process.argv.slice(2);
const mapDir = fs.readdirSync(dataDir).find((d) => fs.existsSync(path.join(dataDir, d, 'map.md')));
const ticketFile = path.join(dataDir, mapDir, 'tickets', '7.md');

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1680, height: 945 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:7477/?tracker=markdown');
await page.locator('.node').first().waitFor({ timeout: 10000 });
console.log('nodes', await page.locator('.node').count());

// External edit: assign #7 on disk, as another agent would.
fs.writeFileSync(ticketFile, fs.readFileSync(ticketFile, 'utf8').replace(/^assignee: *$/m, 'assignee: codex-cli'));
await page.waitForTimeout(2500);
console.log('external claim visible:', (await page.locator('.node', { hasText: 'codex-cli' }).count()) > 0);

// UI write: claim a frontier ticket as trail lead, verify the file changed.
await page.locator('.node.st-frontier').first().click();
await page.getByRole('button', { name: 'Claim', exact: true }).click();
await page.waitForTimeout(1500);
const claimed = fs
  .readdirSync(path.join(dataDir, mapDir, 'tickets'))
  .some((f) => /assignee: operator/.test(fs.readFileSync(path.join(dataDir, mapDir, 'tickets', f), 'utf8')));
console.log('operator claim written to disk:', claimed);
await page.screenshot({ path: out });
await browser.close();

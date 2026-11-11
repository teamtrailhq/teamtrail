// Smoke test for an installed `teamtrail` server: onboarding → new trail → files written to the tracker folder.
// Usage: node scripts/verify-cli.mjs <sign-in link> <trackerDir> [screenshot.png]
// The link is the one `teamtrail` prints as "Sign in" (or a new one from `teamtrail pair`): it signs the browser in.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [url = 'http://127.0.0.1:7420/', dir, shotPath] = process.argv.slice(2);
if (!dir) throw new Error('usage: verify-cli.mjs <sign-in link> <trackerDir> [screenshot.png]');

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url);
await page.locator('.dialog.onboarding').waitFor();
await page.getByRole('button', { name: 'Get started' }).click();
await page.getByRole('button', { name: 'New trail' }).click();
await page.locator('.dialog textarea').first().fill('Ship a changelog page for the CLI');
await page.locator('.dialog footer .btn.primary').click();
await page.locator('.node').nth(2).waitFor({ timeout: 20000 });
await page.waitForTimeout(2500);
if (shotPath) await page.screenshot({ path: shotPath });

const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(dir).map((f) => path.relative(dir, f));
console.log(`title: ${await page.title()}`);
console.log(`nodes on map: ${await page.locator('.node').count()}`);
console.log(`files in ${dir}: ${files.length}`);
for (const f of files.slice(0, 8)) console.log(`  ${f}`);
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close();
if (!files.length || errors.length) process.exit(1);

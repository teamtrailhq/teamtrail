// CI's check that a run leaves nothing in the temp folder: every suite runs in a run folder of its own
// (testTemp.mjs) that it removes, so a new entry here is something that bypassed TMPDIR or was never removed.
//   node scripts/check-temp-leaks.mjs snapshot <file>   before the run: what is in the temp folder now
//   node scripts/check-temp-leaks.mjs compare <file>    after it: fails, naming them, when there are new entries
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// What the tools themselves keep there across runs, never a test's: vite's Node compile cache, and systemd's and
// snap's per-service folders on the CI runner.
const IGNORED = [/^node-compile-cache$/, /^systemd-private-/, /^snap-private-tmp$/];

const [mode, file] = process.argv.slice(2);
if (!['snapshot', 'compare'].includes(mode) || !file) {
  console.error('usage: node scripts/check-temp-leaks.mjs snapshot|compare <file>');
  process.exit(2);
}

const now = fs.readdirSync(os.tmpdir());
if (mode === 'snapshot') {
  fs.writeFileSync(file, JSON.stringify(now));
  console.log(`${now.length} entries in ${os.tmpdir()}`);
  process.exit(0);
}

const before = new Set(JSON.parse(fs.readFileSync(file, 'utf8')));
const added = now.filter((name) => !before.has(name) && !IGNORED.some((re) => re.test(name)));
if (!added.length) {
  console.log(`No new entries in ${os.tmpdir()}`);
  process.exit(0);
}
console.error(`✖ The run left ${added.length} new entries in ${os.tmpdir()}:`);
for (const name of added.slice(0, 50)) {
  console.error(`  ${name}`);
  for (const inner of inside(path.join(os.tmpdir(), name))) console.error(`    ${inner}`);
}
process.exit(1);

/** What a leftover folder holds (a few entries), to tell which test or tool made it. */
function inside(dir) {
  try {
    return fs.readdirSync(dir, { recursive: true }).slice(0, 10);
  } catch {
    return [];
  }
}

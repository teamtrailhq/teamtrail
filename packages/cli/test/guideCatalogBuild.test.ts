import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { guideText } from '../../core/test/fakes/guideCatalog';

const BUILD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/build-guide-catalog.mjs');
const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

let top: string;
let checkout: string;
// git here never reads the person's own config (hooks, signing, credentials)
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (...args: string[]) =>
  execFileSync('git', ['-C', checkout, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { env });

/** A stand-in for `teamtrail guides lint --json`: the fields the build reads, for every guide in the checkout. */
function fakeCli() {
  const file = path.join(top, 'fake-cli.mjs');
  fs.writeFileSync(
    file,
    `import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dir = path.join(process.argv.at(-1), 'guides');
const out = fs.readdirSync(dir).map((n) => {
  const text = fs.readFileSync(path.join(dir, n), 'utf8');
  const sha256 = 'sha256:' + createHash('sha256').update(text).digest('hex');
  return { path: path.join(dir, n), id: n.slice(0, -3), version: /version: (\\S+)/.exec(text)[1], sha256,
    name: n, summary: 's', author: 'a', types: ['task'], ok: true, findings: [] };
});
console.log(JSON.stringify(out));`,
  );
  return file;
}

const build = () => {
  execFileSync(process.execPath, [BUILD, checkout, '--out', checkout, '--cli', fakeCli()], { env, stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(path.join(checkout, 'index.json'), 'utf8')).guides[0];
};

beforeEach(() => {
  top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-catalog-build-'));
  checkout = path.join(top, 'catalog');
  fs.mkdirSync(path.join(checkout, 'guides'), { recursive: true });
  execFileSync('git', ['init', '-q', checkout], { env });
});
afterEach(() => fs.rmSync(top, { recursive: true, force: true }));

// Finding 5: any commit message with a Reviewed-by: line used to mark a guide verified.
it('marks a guide verified only from verified.json, for the exact file that was reviewed', () => {
  const text = guideText({ id: 'perf' });
  fs.writeFileSync(path.join(checkout, 'guides', 'perf.md'), text);
  git('add', '.');
  git('commit', '-q', '-m', 'Add perf\n\nReviewed-by: Totally A Maintainer');
  const claimed = build();
  expect(claimed.verified).toBe(false);
  expect(claimed.reviewedBy).toEqual([]);
  expect(claimed.history[0].reviewer).toBeUndefined();

  const verified = { v: 1, guides: { perf: { sha256: sha(text), reviewer: 'octo-maintainer' } } };
  fs.writeFileSync(path.join(checkout, 'verified.json'), JSON.stringify(verified));
  const ok = build();
  expect(ok).toMatchObject({ verified: true, verifiedSha256: sha(text), reviewedBy: ['octo-maintainer'] });

  // the guide changes after review: its new file isn't the reviewed one
  fs.writeFileSync(path.join(checkout, 'guides', 'perf.md'), text.replace('1.0.0', '1.1.0'));
  const changed = build();
  expect(changed.verified).toBe(false);
  expect(changed.verifiedSha256).toBeUndefined();

  // a reviewer that isn't a GitHub login is not a review
  const free = { v: 1, guides: { perf: { sha256: changed.sha256, reviewer: 'Jane <jane@example.com>' } } };
  fs.writeFileSync(path.join(checkout, 'verified.json'), JSON.stringify(free));
  expect(build().verified).toBe(false);
});

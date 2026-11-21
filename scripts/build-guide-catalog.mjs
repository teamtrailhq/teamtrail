// Builds a guide catalog's index.json and static site from a checkout of the catalog repo.
//
//   node scripts/build-guide-catalog.mjs <catalog checkout> [--out <dir>] [--repo <https url>] [--cli <teamtrail cli.js>]
//
// Catalog repo layout (a public git repo; no server, no accounts):
//   guides/<id>.md          one guide file per guide (the format `teamtrail guides lint` checks)
//   examples/<id>/…        at least one test example per guide: a ticket, a diff, a transcript to try it on
//   verified.json          optional: { "v": 1, "guides": { "<id>": { "sha256": "sha256:…", "reviewer": "<GitHub login>" } } }
//                          the reviewed file of each verified guide; protect it with CODEOWNERS (see below)
//   reported.json          optional: ids of guides with an open report, shown with a "reported" mark
//   builtin.json           optional: ids of guides that are copies of Teamtrail's built-in ones ("Built in" badge)
//   README.md              optional: the guides table is written between <!-- guides:start --> and <!-- guides:end -->
//
// Reviews: a guide is "verified" only while verified.json names the sha256 of its file as it is now, with the GitHub
// login of the maintainer who reviewed it. The catalog repo protects verified.json with CODEOWNERS and a required
// code-owner review, so only a reviewed change to that file marks a guide verified; editing the guide afterwards drops
// the mark until the new file is reviewed. (Commit messages are not used: anyone can write a `Reviewed-by:` line.)
// The index carries the reviewed hash (`verifiedSha256`), and Teamtrail shows Verified only when it is the file's
// sha256, which it checks against what it downloads. Every commit that touched a guide file becomes a history entry
// (version read from the file at that commit).
//
// Output (default <checkout>/dist): index.json (what `teamtrail guides search|add` and the Lookout read), index.html (a
// dependency-free page with report links to `<repo>/issues/new?template=report-guide.yml`), and guides/<id>.md copies.
// Lint errors (schema, safety lint, missing example) stop the build. Needs a built CLI (`npm run build -w teamtrail`,
// or `--cli "$(npm root -g)/teamtrail/dist/cli.js"` after `npm i -g teamtrail`). `--check` writes nothing and exits 1
// when <out>/index.json differs from what it would write.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The logo mark (packages/scout-avatar/src/logo/logoShapes.ts), before the name in the wordmark: six block cursors
// around an open centre, the one pointing up grey, the same on light and dark.
const ARM = 'x="88" y="10" width="24" height="56"';
const MARK = `<svg viewBox="0 0 200 200" aria-hidden="true"><g fill="#FF6B2C">${[60, 120, 180, 240, 300]
  .map((deg) => `<rect ${ARM} transform="rotate(${deg} 100 100)"/>`)
  .join('')}</g><rect ${ARM} fill="#8E8E96"/></svg>`;

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const check = args.includes('--check');
if (check) args.splice(args.indexOf('--check'), 1);
const out0 = flag('--out');
const repo = flag('--repo');
const cli = path.resolve(flag('--cli') ?? path.join(here, '../packages/cli/dist/cli.js'));
const checkout = path.resolve(args[0] ?? '');
if (!args[0] || !fs.existsSync(path.join(checkout, 'guides'))) {
  console.error('usage: build-guide-catalog.mjs <catalog checkout with guides/> [--out <dir>] [--repo <https url>]');
  process.exit(2);
}
if (repo && !/^https:\/\//.test(repo)) {
  console.error('--repo must be an https URL');
  process.exit(2);
}
const out = path.resolve(out0 ?? path.join(checkout, 'dist'));

/** `teamtrail guides lint --json` on the checkout; stops on any error. */
function lint() {
  let text;
  try {
    text = execFileSync(process.execPath, [cli, 'guides', 'lint', '--json', checkout], { encoding: 'utf8' });
  } catch (e) {
    text = e.stdout ?? '';
    const results = text ? JSON.parse(text) : [];
    for (const r of results.filter((x) => !x.ok))
      for (const f of r.findings) console.error(`${path.relative(checkout, r.path)}:${f.line} ${f.rule} ${f.message}`);
    if (!results.length) console.error(e.stderr || e.message);
    process.exit(1);
  }
  return JSON.parse(text);
}

const git = (...a) =>
  execFileSync('git', ['-C', checkout, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** Every commit that touched a guide file, oldest first, with its version and reviewer. */
function historyOf(rel) {
  let log = '';
  try {
    log = git('log', '--format=%H%x09%cI%x09%B%x00', '--', rel);
  } catch {
    return [];
  }
  return log
    .split('\0')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [commit, at] = c.split('\t');
      let version = '?';
      try {
        version = /^version:\s*(\S+)/m.exec(git('show', `${commit}:${rel}`))?.[1] ?? '?';
      } catch {
        // the file didn't exist at that commit (a rename)
      }
      return { version, commit, at };
    })
    .reverse();
}

/** A GitHub login: what CODEOWNERS and branch protection know a reviewer by. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** verified.json: id → the reviewed file's sha256 and its reviewer's login. Malformed entries are left out. */
function readVerified() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(checkout, 'verified.json'), 'utf8'));
  } catch {
    return new Map();
  }
  const out = new Map();
  for (const [id, v] of Object.entries(raw?.v === 1 && raw.guides ? raw.guides : {})) {
    const ok = v && /^sha256:[0-9a-f]{64}$/.test(v.sha256 ?? '') && LOGIN.test(v.reviewer ?? '');
    if (ok) out.set(id, { sha256: v.sha256, reviewer: v.reviewer });
    else console.error(`verified.json: ${id} needs a sha256 and a reviewer's GitHub login; ignored`);
  }
  return out;
}

/** An optional JSON list of ids in the checkout. */
const idSet = (file) => {
  try {
    return new Set(JSON.parse(fs.readFileSync(path.join(checkout, file), 'utf8')));
  } catch {
    return new Set();
  }
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(index) {
  const rows = index.guides.map((r) => {
    const report = repo
      ? ` · <a href="${esc(`${repo}/issues/new?template=report-guide.yml&title=${encodeURIComponent(`Report: ${r.id} ${r.version}`)}`)}">Report</a>`
      : '';
    const badge = r.builtin
      ? '<span class="v">Built in</span>'
      : r.verified
        ? '<span class="v">Verified</span>'
        : '<span class="u">Unreviewed</span>';
    const reported = r.reported ? ' <span class="r">Reported</span>' : '';
    return `<li><h2>${esc(r.name ?? r.id)} <code>${esc(r.id)}</code> ${esc(r.version)} ${badge}${reported}</h2>
<p>${esc(r.summary)}</p><p class="m">by ${esc(r.author)} · for ${esc((r.types ?? []).join(', '))} · reviewed by ${esc(r.reviewedBy.join(', ') || 'nobody yet')} · <a href="${esc(r.path)}">${esc(r.path)}</a>${report}</p>
<p class="m">Add it: <code>npx teamtrail guides add ${esc(r.id)}</code></p></li>`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teamtrail guides</title><style>
:root{--bg:#fff;--text:#3a3d44;--hi:#0e0f11;--dim:#62666e;--line:rgba(0,0,0,.1);--chip:#f4f4f5;--accent:#bf3900;--ok:#0e7a4c;--warn:#b81e48;--dot:rgba(0,0,0,.09)}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0b;--text:#c9cbd0;--hi:#f4f4f6;--dim:#8d9199;--line:rgba(255,255,255,.1);--chip:#161618;--accent:#ff6b2c;--ok:#3ccf8e;--warn:#ff4d7a;--dot:rgba(255,255,255,.08)}}
body{margin:0;font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif;color:var(--text);background:var(--bg) radial-gradient(var(--dot) 1px,transparent 1.4px) 0 0/24px 24px}
main{max-width:52rem;margin:0 auto;padding:3rem 1rem}
.wm{display:inline-flex;align-items:center;gap:.24em;font-weight:600;font-size:1.25rem;line-height:1;letter-spacing:-.035em;color:var(--hi);white-space:nowrap}
.wm svg{flex:none;width:.86em;height:.86em;transform:translateY(.04em)}
h1{margin:1.5rem 0 .5rem;font-size:2.25rem;line-height:1.1;letter-spacing:-.03em;font-weight:600;color:var(--hi)}
main>p{color:var(--dim);max-width:44rem}
ul{list-style:none;padding:0;margin:2rem 0 0;border-top:1px solid var(--line)}li{border-bottom:1px solid var(--line);padding:1.1rem 0;background:var(--bg)}
h2{font-size:1.05rem;margin:0;font-weight:600;color:var(--hi);display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
h2 code{color:var(--dim);font-weight:400}li p{margin:.3rem 0}
.m{color:var(--dim);font-size:.85rem}a{color:var(--accent)}
code{font:.85em "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
.m code{color:var(--hi);background:var(--chip);border:1px solid var(--line);padding:.1rem .4rem}
.v,.u,.r{font:500 .7rem/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;padding:.3rem .45rem;border:1px solid var(--line)}
.v{color:var(--ok)}.u{color:var(--dim)}.r{color:var(--warn)}
</style></head><body><main><div class="wm" role="img" aria-label="Teamtrail">${MARK}teamtrail</div><h1>Bring a guide for the hard stretches.</h1>
<p>Guides your coding agents can take on. Each is a plain markdown file. The lint looks for common problems; it isn't a review. A guide is Verified when a maintainer reviewed this exact file (its hash is in verified.json). Read a guide before you approve it: installing one pins its hash, and any check command it proposes runs only after you approve that too.</p>
<ul>${rows.join('\n')}</ul></main></body></html>\n`;
}

const reported = idSet('reported.json');
const reviewed = readVerified();
const builtin = idSet('builtin.json');
const guides = lint().map((r) => {
  const rel = path.relative(checkout, r.path).split(path.sep).join('/');
  const history = historyOf(rel);
  const review = reviewed.get(r.id);
  const verified = !!review && review.sha256 === r.sha256;
  return {
    id: r.id,
    version: r.version,
    path: `guides/${path.basename(r.path)}`,
    sha256: r.sha256,
    name: r.name,
    summary: r.summary,
    author: r.author,
    types: r.types,
    verified,
    ...(verified ? { verifiedSha256: review.sha256 } : {}),
    reviewedBy: verified ? [review.reviewer] : [],
    history,
    ...(reported.has(r.id) ? { reported: true } : {}),
    ...(builtin.has(r.id) ? { builtin: true } : {}),
  };
});
const index = { v: 1, ...(repo ? { repo } : {}), guides };
const json = `${JSON.stringify(index, null, 2)}\n`;
if (check) {
  const current = fs.existsSync(path.join(out, 'index.json'))
    ? fs.readFileSync(path.join(out, 'index.json'), 'utf8')
    : '';
  if (current === json) {
    console.log('index.json is up to date');
    process.exit(0);
  }
  console.error('index.json is out of date: run build-guide-catalog.mjs and commit the result');
  process.exit(1);
}
fs.mkdirSync(path.join(out, 'guides'), { recursive: true });
for (const r of guides) {
  const from = path.join(checkout, r.path);
  const to = path.join(out, r.path);
  if (path.resolve(from) !== path.resolve(to)) fs.copyFileSync(from, to);
}
fs.writeFileSync(path.join(out, 'index.json'), json);
fs.writeFileSync(path.join(out, 'index.html'), page(index));
writeReadmeTable(index);
console.log(`catalog: ${guides.length} guides → ${path.relative(process.cwd(), out) || out}`);

/** The guides table in the checkout's README, between its markers, when it has them. */
function writeReadmeTable(idx) {
  const file = path.join(checkout, 'README.md');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  const re = /(<!-- guides:start -->)[\s\S]*?(<!-- guides:end -->)/;
  if (!re.test(text)) return;
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const status = (g) => (g.builtin ? 'Built in' : g.verified ? 'Verified' : 'Not reviewed yet');
  const rows = idx.guides.map(
    (g) =>
      `| [${cell(g.name ?? g.id)}](${g.path}) | \`${g.id}\` | ${g.version} | ${status(g)} | ${cell(g.summary)} | ${cell(g.author)} |`,
  );
  const table = [
    '| Guide | Id | Version | Status | What it does | Author |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ];
  fs.writeFileSync(file, text.replace(re, `$1\n${table.join('\n')}\n$2`));
}

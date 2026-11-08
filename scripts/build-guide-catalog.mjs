// Builds a guide catalog's index.json and static site from a checkout of the catalog repo.
//
//   node scripts/build-guide-catalog.mjs <catalog checkout> [--out <dir>] [--repo <https url>] [--cli <teamtrail cli.js>]
//
// Catalog repo layout (a public git repo; no server, no accounts):
//   guides/<id>.md          one guide file per guide (the format `teamtrail guides lint` checks)
//   examples/<id>/…        at least one test example per guide: a ticket, a diff, a transcript to try it on
//   reported.json          optional: ids of guides with an open report, shown with a "reported" mark
//
// Reviews: maintainers merge a guide change with a `Reviewed-by: <name>` trailer in the commit message. Every commit
// that touched a guide file becomes a history entry (version read from the file at that commit, reviewer from the
// trailer); a guide is "verified" when its latest commit has a reviewer.
//
// Output (default <checkout>/dist): index.json (what `teamtrail guides search|add` and the Lookout read), index.html (a
// dependency-free page with report links to `<repo>/issues/new?template=report-guide.yml`), and guides/<id>.md copies.
// Lint errors (schema, safety lint, missing example) stop the build. Needs a built CLI (`npm run build -w teamtrail`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
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

const git = (...a) => execFileSync('git', ['-C', checkout, ...a], { encoding: 'utf8' });

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
      const [commit, at, ...body] = c.split('\t');
      const reviewer = /^Reviewed-by:\s*(.+)$/im.exec(body.join('\t'))?.[1].trim();
      let version = '?';
      try {
        version = /^version:\s*(\S+)/m.exec(git('show', `${commit}:${rel}`))?.[1] ?? '?';
      } catch {
        // the file didn't exist at that commit (a rename)
      }
      return { version, commit, at, ...(reviewer ? { reviewer } : {}) };
    })
    .reverse();
}

const readReported = () => {
  try {
    return new Set(JSON.parse(fs.readFileSync(path.join(checkout, 'reported.json'), 'utf8')));
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
    const badge = r.verified ? '<span class="v">Verified</span>' : '<span class="u">Unreviewed</span>';
    const reported = r.reported ? ' <span class="r">Reported</span>' : '';
    return `<li><h2>${esc(r.name ?? r.id)} <code>${esc(r.id)}</code> ${esc(r.version)} ${badge}${reported}</h2>
<p>${esc(r.summary)}</p><p class="m">by ${esc(r.author)} · for ${esc((r.types ?? []).join(', '))} · reviewed by ${esc(r.reviewedBy.join(', ') || 'nobody yet')} · <a href="${esc(r.path)}">${esc(r.path)}</a>${report}</p>
<p class="m">Add it: <code>npx teamtrail guides add ${esc(r.id)}</code></p></li>`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teamtrail guides</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#1d2321;background:#fbfaf6}
ul{list-style:none;padding:0}li{border-top:1px solid #ddd;padding:1rem 0}h2{font-size:1.1rem;margin:0}
.m{color:#666;font-size:.9rem;margin:.2rem 0}.v,.u,.r{font-size:.75rem;padding:.1rem .4rem;border-radius:.3rem;margin-left:.3rem}
.v{background:#dcefe2}.u{background:#eee}.r{background:#f6dcd6}code{font-size:.9em}
@media (prefers-color-scheme:dark){body{background:#151816;color:#e7e9e5}li{border-color:#333}.m{color:#9a9f99}.v{background:#244231}.u{background:#333}.r{background:#4a2a24}}
</style></head><body><h1>Teamtrail guides</h1>
<p>Guides your coding agents can take on. Each is a plain markdown file, linted for prompt injection and reviewed before it is marked verified. Installing one pins its hash; any check command it proposes runs only after you approve it.</p>
<ul>${rows.join('\n')}</ul></body></html>\n`;
}

const reported = readReported();
const guides = lint().map((r) => {
  const rel = path.relative(checkout, r.path).split(path.sep).join('/');
  const history = historyOf(rel);
  const reviewers = [...new Set(history.map((h) => h.reviewer).filter(Boolean))];
  return {
    id: r.id,
    version: r.version,
    path: `guides/${path.basename(r.path)}`,
    sha256: r.sha256,
    name: r.name,
    summary: r.summary,
    author: r.author,
    types: r.types,
    verified: !!history.at(-1)?.reviewer,
    reviewedBy: reviewers,
    history,
    ...(reported.has(r.id) ? { reported: true } : {}),
  };
});
const index = { v: 1, ...(repo ? { repo } : {}), guides };
fs.mkdirSync(path.join(out, 'guides'), { recursive: true });
for (const r of guides) fs.copyFileSync(path.join(checkout, r.path), path.join(out, r.path));
fs.writeFileSync(path.join(out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'index.html'), page(index));
console.log(`catalog: ${guides.length} guides → ${path.relative(process.cwd(), out) || out}`);

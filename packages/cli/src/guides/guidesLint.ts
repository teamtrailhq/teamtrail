import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BRAND, GUIDE_CATALOG_CONTRIBUTING, lintGuide, type GuideFinding } from '@teamtrail/core';
import { guideSha } from '@teamtrail/core/agents';
import { printFindings } from './printFindings';
import type { GuidesArgs, GuidesIo } from './types';

/** One guide file and where its catalog keeps test examples (`examples/<id>/`), when it is part of a catalog. */
type Target = { file: string; catalog?: string };

/**
 * A project's tracker folder: its hand-written guides (`guides/`) need no test example, unlike a catalog checkout's.
 * Known by its name, its guide lock or config, or being the folder `--dir` names.
 */
const isTracker = (dir: string, trackerDir: string) =>
  path.resolve(dir) === path.resolve(trackerDir) ||
  path.basename(dir) === BRAND.dataDir ||
  existsSync(path.join(dir, 'guides.lock.json')) ||
  existsSync(path.join(dir, 'guides.json'));

/**
 * The guide files under a path: a catalog checkout or tracker folder (`guides/*.md`), a folder of `.md` files, or one
 * file. Everything but a tracker folder's guides is held to the catalog's rules.
 */
function targetsOf(p: string, trackerDir: string): Target[] {
  if (!statSync(p).isDirectory()) {
    const top = path.dirname(path.dirname(p));
    const inCatalog = path.basename(path.dirname(p)) === 'guides' && !isTracker(top, trackerDir);
    return [{ file: p, ...(inCatalog ? { catalog: top } : {}) }];
  }
  const guides = path.join(p, 'guides');
  const dir = existsSync(guides) ? guides : p;
  const catalog = isTracker(p, trackerDir) ? {} : { catalog: p };
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md') && n.toLowerCase() !== 'readme.md')
    .sort()
    .map((n) => ({ file: path.join(dir, n), ...catalog }));
}

const hasExample = (catalog: string, id: string) => {
  const dir = path.join(catalog, 'examples', id);
  return existsSync(dir) && readdirSync(dir).length > 0;
};

function lintTarget(t: Target) {
  const text = readFileSync(t.file, 'utf8');
  const lint = lintGuide(text);
  const id = lint.guide?.id ?? path.basename(t.file, '.md');
  const extra: GuideFinding[] = [];
  if (lint.guide && lint.guide.id !== path.basename(t.file, '.md'))
    extra.push({ line: 3, rule: 'schema', level: 'error', message: `id "${id}" must match the file name` });
  if (t.catalog && !hasExample(t.catalog, id))
    extra.push({ line: 1, rule: 'example', level: 'error', message: `no test example in examples/${id}/` });
  const findings = [...lint.findings, ...extra].sort((a, b) => a.line - b.line);
  const r = lint.guide;
  return {
    path: t.file,
    id,
    version: r?.version,
    name: r?.name,
    summary: r?.summary,
    author: r?.author,
    types: r?.handles.types,
    sha256: guideSha(text),
    findings,
    ok: !findings.some((f) => f.level === 'error'),
  };
}

/**
 * `guides lint <dir|file...>`: the catalog's gate, and a check of your own guides. Each guide must pass the schema and
 * safety lint and, in a catalog, have a test example in `examples/<id>/`. Exit code 1 on any error; `--json` for
 * build-guide-catalog.mjs. Clean guides outside a catalog get a pointer to sharing them.
 */
export function guidesLint(a: GuidesArgs, io: GuidesIo): number {
  // no path: the project's own guides, or the catalog checkout you're in
  const fallback = existsSync(path.join(a.dir, 'guides')) ? a.dir : '.';
  const targets = (a.rest.length ? a.rest : [fallback]).flatMap((p) => targetsOf(path.resolve(p), a.dir));
  const results = targets.map(lintTarget);
  if (a.json) io.out(`${JSON.stringify(results, null, 2)}\n`);
  else {
    for (const r of results) printFindings(io, path.relative(process.cwd(), r.path) || r.path, r.findings);
    const bad = results.filter((r) => !r.ok).length;
    io.out(`${results.length} guides linted, ${bad ? `${bad} with errors` : 'all clean'}\n`);
    if (!bad && targets.some((t) => !t.catalog)) io.out(`Share it with everyone: ${GUIDE_CATALOG_CONTRIBUTING}\n`);
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

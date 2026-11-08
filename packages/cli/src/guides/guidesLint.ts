import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { lintGuide, type GuideFinding } from '@teamtrail/core';
import { guideSha } from '@teamtrail/core/agents';
import { printFindings } from './printFindings';
import type { GuidesArgs, GuidesIo } from './types';

/** One guide file and where its catalog keeps test examples (`examples/<id>/`), when it is part of a catalog. */
type Target = { file: string; catalog?: string };

/** The guide files under a path: a catalog checkout (`guides/*.md`), a folder of `.md` files, or one file. */
function targetsOf(p: string): Target[] {
  if (!statSync(p).isDirectory()) {
    const parent = path.dirname(p);
    return [{ file: p, ...(path.basename(parent) === 'guides' ? { catalog: path.dirname(parent) } : {}) }];
  }
  const guides = path.join(p, 'guides');
  const dir = existsSync(guides) ? guides : p;
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md') && n.toLowerCase() !== 'readme.md')
    .sort()
    .map((n) => ({ file: path.join(dir, n), catalog: p }));
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
 * `guides lint <dir|file...>`: the catalog's gate. Each guide must pass the schema and safety lint and, in a catalog,
 * have a test example in `examples/<id>/`. Exit code 1 on any error; `--json` for build-guide-catalog.mjs.
 */
export function guidesLint(a: GuidesArgs, io: GuidesIo): number {
  const targets = (a.rest.length ? a.rest : ['.']).flatMap((p) => targetsOf(path.resolve(p)));
  const results = targets.map(lintTarget);
  if (a.json) io.out(`${JSON.stringify(results, null, 2)}\n`);
  else {
    for (const r of results) printFindings(io, path.relative(process.cwd(), r.path) || r.path, r.findings);
    const bad = results.filter((r) => !r.ok).length;
    io.out(`${results.length} guides linted, ${bad ? `${bad} with errors` : 'all clean'}\n`);
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

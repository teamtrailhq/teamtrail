import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { lintRole, type RoleFinding } from '@teamtrail/core';
import { roleSha } from '@teamtrail/core/agents';
import { printFindings } from './printFindings';
import type { RolesArgs, RolesIo } from './types';

/** One role file and where its catalog keeps test examples (`examples/<id>/`), when it is part of a catalog. */
type Target = { file: string; catalog?: string };

/** The role files under a path: a catalog checkout (`roles/*.md`), a folder of `.md` files, or one file. */
function targetsOf(p: string): Target[] {
  if (!statSync(p).isDirectory()) {
    const parent = path.dirname(p);
    return [{ file: p, ...(path.basename(parent) === 'roles' ? { catalog: path.dirname(parent) } : {}) }];
  }
  const roles = path.join(p, 'roles');
  const dir = existsSync(roles) ? roles : p;
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
  const lint = lintRole(text);
  const id = lint.role?.id ?? path.basename(t.file, '.md');
  const extra: RoleFinding[] = [];
  if (lint.role && lint.role.id !== path.basename(t.file, '.md'))
    extra.push({ line: 3, rule: 'schema', level: 'error', message: `id "${id}" must match the file name` });
  if (t.catalog && !hasExample(t.catalog, id))
    extra.push({ line: 1, rule: 'example', level: 'error', message: `no test example in examples/${id}/` });
  const findings = [...lint.findings, ...extra].sort((a, b) => a.line - b.line);
  const r = lint.role;
  return {
    path: t.file,
    id,
    version: r?.version,
    name: r?.name,
    summary: r?.summary,
    author: r?.author,
    types: r?.handles.types,
    sha256: roleSha(text),
    findings,
    ok: !findings.some((f) => f.level === 'error'),
  };
}

/**
 * `roles lint <dir|file...>`: the catalog's gate. Each role must pass the schema and safety lint and, in a catalog,
 * have a test example in `examples/<id>/`. Exit code 1 on any error; `--json` for build-role-catalog.mjs.
 */
export function rolesLint(a: RolesArgs, io: RolesIo): number {
  const targets = (a.rest.length ? a.rest : ['.']).flatMap((p) => targetsOf(path.resolve(p)));
  const results = targets.map(lintTarget);
  if (a.json) io.out(`${JSON.stringify(results, null, 2)}\n`);
  else {
    for (const r of results) printFindings(io, path.relative(process.cwd(), r.path) || r.path, r.findings);
    const bad = results.filter((r) => !r.ok).length;
    io.out(`${results.length} roles linted, ${bad ? `${bad} with errors` : 'all clean'}\n`);
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

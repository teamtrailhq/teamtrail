import type { Proof, ProofCheck, ProofReview } from '@teamtrail/core';
import type { StatusMarkKind } from '../../components/ui';
import { shortModel } from '../../lib';

/** One line of a proof's checks: a mark, a name, what it ran (or who), and how it went. */
export interface ProofLine {
  key: string;
  mark: StatusMarkKind;
  name: string;
  what: string;
  meta?: string;
  /** Rose: it holds the work for you now (a held pass). */
  holds?: boolean;
}

/** "1.2s", "450ms", "2m 3s". */
export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * A check's command as approved, as people read it: its argv joined, and its folder when it isn't the repo's root
 * (`npm test · in apps/web`). A program named by a path shows by its name only (`/…/bin/node x` → `node x`), so no
 * absolute path ever reaches the screen.
 */
export function command(argv: string[], folder?: string): string {
  const [program = '', ...rest] = argv;
  const name = program.includes('/') ? (program.split('/').filter(Boolean).pop() ?? program) : program;
  const line = [name, ...rest].join(' ');
  return inFolder(folder) ? `${line} · in ${folder}` : line;
}

/** A repo-relative folder worth naming: not the root, and never an absolute path. */
const inFolder = (folder?: string): folder is string =>
  !!folder && folder !== '.' && !folder.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(folder);

function checkLine(c: ProofCheck, folder?: string): ProofLine {
  const base = { key: `check:${c.name}`, name: c.name, what: command(c.argv, folder) };
  if (c.passed) return { ...base, mark: 'done', meta: duration(c.durationMs) };
  if (c.knownFailure) return { ...base, mark: 'todo', meta: 'fails on main' };
  const how = c.exitCode === null ? "didn't start" : `failed, exit ${c.exitCode}`;
  return { ...base, mark: 'rework', meta: how };
}

function guardLine(g: NonNullable<Proof['guard']>): ProofLine {
  const what = g.findings.length > 1 ? `${g.findings[0]} (+${g.findings.length - 1} more)` : (g.findings[0] ?? '');
  const base = { key: 'guard', name: 'check guard', what };
  if (g.accepted) return { ...base, mark: 'done', meta: `accepted by ${g.accepted.by}` };
  if (g.mode === 'observe') return { ...base, mark: 'todo', meta: 'observed' };
  return { ...base, mark: 'held', meta: 'held', holds: true };
}

const model = (id?: string) => (id ? (shortModel(id) ?? id) : undefined);

function reviewWhat(r: ProofReview, author?: string): string {
  const mine = model(r.model);
  if (!mine) return r.by;
  const theirs = model(author);
  if (r.sameModel) return `${r.by} · ${mine} = author ${theirs ?? mine}`;
  return theirs ? `${r.by} · ${mine} ≠ author ${theirs}` : `${r.by} · ${mine}`;
}

function reviewLine(r: ProofReview, i: number, author?: string): ProofLine {
  const base = {
    key: `review:${i}`,
    name: r.byKind === 'trail lead' ? 'approval' : 'review',
    what: reviewWhat(r, author),
  };
  if (r.verdict !== 'PASS') return { ...base, mark: 'rework', meta: r.verdict.toLowerCase() };
  if (r.sameModel) return { ...base, mark: 'todo', meta: 'the same model as the author' };
  return { ...base, mark: r.independent ? 'done' : 'todo', meta: 'pass' };
}

/**
 * A proof's checks as lines, in the order they count: each check with its command and how long it took (or how it
 * failed), checks it went without (skipped by the trail lead, outside their paths), the check guard when it found
 * something, then each review with the reviewer's model against the author's. `folders`: each check's repo-relative
 * folder, from the attempt the proof is of. Pure: recorded data only.
 */
export function proofLines(proof: Proof, folders?: ReadonlyMap<string, string>): ProofLine[] {
  const lines = proof.checks.map((c) => checkLine(c, folders?.get(c.name)));
  for (const w of proof.waived ?? [])
    lines.push({
      key: `waived:${w.name}`,
      mark: 'todo',
      name: w.name,
      what: command(w.argv),
      meta: `skipped by ${w.by}`,
    });
  for (const o of proof.outOfScope ?? [])
    lines.push({ key: `out:${o.name}`, mark: 'todo', name: o.name, what: command(o.argv), meta: 'not run' });
  if (proof.guard) lines.push(guardLine(proof.guard));
  proof.reviews.forEach((r, i) => lines.push(reviewLine(r, i, proof.attempt.model)));
  return lines;
}

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { AnswerFile } from './answerFiles';

/*
 * A question's numbered answers as this machine wrote them, kept where nothing in the repo can write:
 *   <config dir>/projects/<project id>/answer-line/<sessionId>--<questionId>.json
 *   { v: 1, answers: { "<n>": { sha, prior: { "<m>": sha } } } }
 * Each answer file's sha256, and the numbered files already there when it was written (`prior`). The files sit in
 * the repo, where an agent can't write a signed answer but can delete one: deleting the first answer would put the
 * next in its place, another person's, after the human who gave it was told theirs wasn't used. So an answer counts
 * only while it is the file written here and every file it came after is still there as it was: a deletion fails
 * closed (nothing after it counts, the question stays open) and an answer given after the deletion counts.
 */
const DIR = 'answer-line';
const SAFE_ID = /^[\w-]{1,128}$/;

type Entry = { sha: string; prior: Record<string, string> };
type Line = { v: 1; answers: Record<string, Entry> };
type Question = { sessionId: string; questionId: string };

/** The sha256 of a file as it is now, or undefined when it can't be read. */
export function fileSha(file: string): string | undefined {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    return undefined;
  }
}

function lineOf(root: string, q: Question) {
  if (!SAFE_ID.test(q.sessionId) || !SAFE_ID.test(q.questionId)) throw new Error('unsafe question id');
  const store = machineStore(root);
  const name = `${DIR}/${q.sessionId}--${q.questionId}.json`;
  const read = (): Line | undefined => {
    const l = store.read<Line>(name);
    return l?.v === 1 && l.answers && typeof l.answers === 'object' ? l : undefined;
  };
  return { store, name, read };
}

/**
 * Runs `add` (which links the answer file) with the line held, so writers take numbers one at a time, recording the
 * answer before its file appears: `entry(seq)` gives what to record for the number about to be tried.
 */
export function inAnswerLine<T>(root: string, q: Question, add: (record: (seq: number, e: Entry) => void) => T): T {
  const { store, name, read } = lineOf(root, q);
  mkdirSync(path.dirname(store.file(name)), { recursive: true, mode: 0o700 });
  return withFileLock(store.file(`${name}.lock`), () =>
    add((seq, e) => {
      const line = read() ?? { v: 1, answers: {} };
      store.write(name, { ...line, answers: { ...line.answers, [seq]: e } });
    }),
  );
}

/**
 * Whether an answer file still has its place in line: it is the file written here and the files it came after are
 * all there as they were. A question with no line on this machine (answered by a Teamtrail from before it) keeps
 * the old rule, every file in place; so does the single file of older versions (`seq` 0).
 */
export function answerInLine(root: string, q: Question): (f: AnswerFile) => boolean {
  let line: Line | undefined;
  try {
    line = lineOf(root, q).read();
  } catch {
    return () => false;
  }
  if (!line) return () => true;
  const answers = line.answers;
  return (f) => {
    if (f.seq === 0) return true;
    const e = answers[f.seq];
    if (!e || fileSha(f.file) !== e.sha) return false;
    const dir = path.dirname(f.file);
    return Object.entries(e.prior ?? {}).every(([m, sha]) => fileSha(path.join(dir, `${m}.json`)) === sha);
  };
}

/** Forgets a question's line, once its answer folder is gone. */
export function forgetAnswerLine(root: string, q: Question) {
  try {
    const { store, name } = lineOf(root, q);
    store.remove(name);
  } catch {
    /* an id that never had a line */
  }
}

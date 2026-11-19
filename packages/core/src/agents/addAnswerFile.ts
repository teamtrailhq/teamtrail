import { randomBytes } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { AGENTS_DIR, agentPaths, type AgentAnswer } from './agentLink';
import { answerFiles, answerNumbers, type AnswerFile } from './answerFiles';

/** How many times a writer looks again for a free number when others took the one it picked. */
const TRIES = 64;

/**
 * Adds an answer as the next numbered file in its question's folder and returns its number. Two answers given at
 * once each get their own file, so neither overwrites the other; the order is the order the files appeared.
 *
 * The file is written whole under a name of its own, then hard-linked to `<n>.json`, which fails if the name is
 * taken: a number is never given twice, and nobody reads half an answer. `n` is the lowest free number above the
 * last answer that verifies (`valid`): a file planted by anything that can't sign (the asking agent, a teammate's
 * push) only takes a name, never a place in line, so it can't come first or block the human's answer. As long as
 * files are only added, every answer numbered below another was there before it, so whoever reads the folder
 * later sees the same first answer.
 */
export function addAnswerFile(root: string, ans: AgentAnswer, valid: (f: AnswerFile) => boolean): number {
  const dir = answerDir(root, ans);
  const tmp = path.join(dir, `.${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
  writeFileSync(tmp, JSON.stringify(ans, null, 2), { flag: 'wx' });
  try {
    for (let i = 0; i < TRIES; i++) {
      const seq = nextNumber(root, ans, valid);
      if (linked(tmp, path.join(dir, `${seq}.json`))) return seq;
    }
  } finally {
    rmSync(tmp, { force: true });
  }
  throw new Error('Too many answers at once: try again');
}

function nextNumber(root: string, ans: AgentAnswer, valid: (f: AnswerFile) => boolean) {
  const files = answerFiles(root, ans.sessionId, ans.questionId);
  const taken = new Set(answerNumbers(path.join(root, agentPaths.answerDir(ans.sessionId, ans.questionId))));
  let seq = Math.max(0, ...files.filter(valid).map((f) => f.seq)) + 1;
  while (taken.has(seq)) seq++;
  return seq;
}

function linked(from: string, to: string) {
  try {
    linkSync(from, to);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}

/**
 * The question's folder, made when missing. Anything else in its place (a file, or a link that would send the
 * answer elsewhere) was not made by Teamtrail: it is removed rather than let it stop the answer.
 */
function answerDir(root: string, ans: AgentAnswer) {
  ensureLocalDir(path.join(root, AGENTS_DIR));
  const dir = path.join(root, agentPaths.answerDir(ans.sessionId, ans.questionId));
  for (const d of [path.dirname(path.dirname(dir)), path.dirname(dir), dir]) notADirectoryRemoved(d);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function notADirectoryRemoved(dir: string) {
  try {
    if (!lstatSync(dir).isDirectory()) rmSync(dir, { force: true });
  } catch {
    /* missing: made below */
  }
}

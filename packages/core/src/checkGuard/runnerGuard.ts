import type { AttemptGuard } from '../model/checkGuard';
import type { GitEvidence } from '../model/evidence';
import type { VerificationConfig } from '../model/verification';
import type { CheckRunner } from '../verification/checkRunner';
import { commitReader } from './gitReaders';
import { guardAttempt } from './guardAttempt';
import type { ReadText } from './types';

const MAX_CHARS = 1024 * 1024;
/** A runner that doesn't answer a read in time hasn't read it. */
const READ_MS = 30_000;

function inTime<T>(p: Promise<T>): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), READ_MS);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** A commit's files through the runner, which has the work; what it answers is checked like any report. */
function viaRunner(read: NonNullable<CheckRunner['read']>, commit: string): ReadText {
  return async (rel) => {
    const text = await inTime(read({ commit, path: rel })).catch(() => undefined);
    if (text === null) return null;
    return typeof text === 'string' && text.length <= MAX_CHARS ? text : undefined;
  };
}

/** The runner's reader for a commit when it has one, else this checkout's git, which may hold the commit. */
async function readerOf(runner: CheckRunner, repoRoot: string, commit: string | null | undefined): Promise<ReadText> {
  if (commit && runner.read) return viaRunner(runner.read.bind(runner), commit);
  return commitReader(repoRoot, commit);
}

/**
 * The check guard on a remote completion a runner checked: the files its report says changed, read at the base and
 * the head it names, through the runner (`CheckRunner.read`) or this checkout's git. A file it needs and can't read is
 * a finding of its own (`unread`): the guard can't say it changed nothing.
 */
export async function runnerGuard(o: {
  config: VerificationConfig | undefined;
  checks: string[];
  git: GitEvidence;
  runner: CheckRunner;
  repoRoot: string;
}): Promise<AttemptGuard | undefined> {
  if (!o.git.changed.length) return undefined;
  return guardAttempt({
    config: o.config,
    checks: o.checks,
    changed: o.git.changed.map((c) => c.path),
    read: {
      before: await readerOf(o.runner, o.repoRoot, o.git.base?.head),
      after: await readerOf(o.runner, o.repoRoot, o.git.tree?.head),
    },
  });
}

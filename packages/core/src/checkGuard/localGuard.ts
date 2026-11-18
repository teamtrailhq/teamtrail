import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { AttemptGuard } from '../model/checkGuard';
import type { GitEvidence } from '../model/evidence';
import type { VerificationConfig } from '../model/verification';
import { commitReader, worktreeReader } from './gitReaders';
import { guardAttempt } from './guardAttempt';

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** Where the checkout the checks ran in sits inside the git worktree: '' when they're the same folder. */
function prefixOf(toplevel: string, checkout: string) {
  const rel = path.relative(real(toplevel), real(checkout)).split(path.sep).join('/');
  return rel.startsWith('..') || path.isAbsolute(rel) ? '' : rel;
}

/**
 * The check guard on work in this checkout: the files git saw change since the claim, read at the claim's commit and
 * in the worktree now. Nothing without a baseline to compare with.
 */
export async function localGuard(o: {
  config: VerificationConfig | undefined;
  checks: string[];
  git: GitEvidence;
  checkout: string;
}): Promise<AttemptGuard | undefined> {
  const { tree, base } = o.git;
  if (!tree || !base?.head || !o.git.changed.length) return undefined;
  return guardAttempt({
    config: o.config,
    checks: o.checks,
    changed: o.git.changed.map((c) => c.path),
    read: { before: await commitReader(tree.toplevel, base.head), after: worktreeReader(tree.toplevel) },
    prefix: prefixOf(tree.toplevel, o.checkout),
  });
}

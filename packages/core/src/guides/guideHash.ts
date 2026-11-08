import { createHash } from 'node:crypto';
import type { ProposedCheck } from '../model/guide';

const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

/** The hash a lockfile pins a guide file to: the exact bytes, line endings included. */
export const guideSha = (text: string) => sha(text);

/** The hash an approved check is recorded with: a different argv, cwd or timeout needs approval again. */
export const checkSha = (spec: ProposedCheck) =>
  sha(JSON.stringify({ run: spec.run, cwd: spec.cwd ?? null, timeoutSec: spec.timeoutSec ?? null }));

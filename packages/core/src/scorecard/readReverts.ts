import { gitText } from '../evidence/git';
import { defaultHead } from '../mainChecks/defaultHead';
import type { RevertCommit } from '../model/escape';
import { isObjectId } from '../workspaces/gitNames';

/** What `git revert` writes in the message. The default branch is searched back 2000 commits. */
const REVERTS = /This reverts commit ([0-9a-f]{7,64})/gi;

/** What was read per checkout and commit (the last few): git is asked again only when the commit moves. */
const cache = new Map<string, RevertCommit[]>();
const CACHED = 16;

interface Reverting {
  sha: string;
  at: number;
  reverts: string[];
}

function parseLog(text: string): Reverting[] {
  return text.split('\x1e').flatMap((record) => {
    const [sha, ct, body = ''] = record.trim().split('\0');
    if (!sha || !isObjectId(sha)) return [];
    const reverts = [...body.matchAll(REVERTS)].map((m) => m[1].toLowerCase());
    return reverts.length ? [{ sha, at: Number(ct) * 1000, reverts }] : [];
  });
}

/** Each reverted commit's parents and subject, for the ones git still has. */
async function describe(top: string, shas: string[]) {
  const out = shas.length
    ? await gitText(top, [
        'log',
        '--no-walk=unsorted',
        '--ignore-missing',
        '--format=%H%x00%P%x00%s%x1e',
        '--end-of-options',
        ...shas,
        '--',
      ])
    : undefined;
  return (out ?? '').split('\x1e').flatMap((line) => {
    const [sha, parents = '', subject = ''] = line.trim().split('\0');
    return sha && isObjectId(sha) ? [{ sha, parents: parents.split(' ').filter(isObjectId), subject }] : [];
  });
}

async function readFrom(top: string, commit: string): Promise<RevertCommit[]> {
  const log = await gitText(top, [
    'log',
    '--max-count=2000',
    '--no-color',
    '-i',
    '--grep=This reverts commit ',
    '--format=%H%x00%ct%x00%B%x1e',
    '--end-of-options',
    commit,
    '--',
  ]);
  const reverting = parseLog(log ?? '');
  const known = await describe(top, [...new Set(reverting.flatMap((r) => r.reverts))]);
  return reverting.flatMap((r) =>
    r.reverts.map((sha) => {
      const k = known.find((x) => x.sha.startsWith(sha));
      return {
        sha: r.sha,
        at: r.at,
        reverts: sha,
        revertedParents: k?.parents ?? [],
        ...(k ? { revertedSubject: k.subject.slice(0, 200) } : {}),
      };
    }),
  );
}

/**
 * The commits on the default branch that revert another (`This reverts commit <sha>`, as `git revert` writes), each
 * with the reverted commit's parents and subject. Read locally, nothing fetched; none outside git. `at` reads them in
 * the history of that commit instead of the default branch's head here: the one a trail's checks run on
 * (trailChecks/trailHead.ts), so what counts as reverted is what that commit holds.
 */
export async function readReverts(root: string, o: { at?: string } = {}): Promise<RevertCommit[]> {
  const head = await defaultHead(root);
  if (!('commit' in head)) return [];
  const commit = o.at && isObjectId(o.at) ? o.at : head.commit;
  const key = `${head.top}\0${commit}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const reverts = await readFrom(head.top, commit);
  cache.set(key, reverts);
  if (cache.size > CACHED) cache.delete(cache.keys().next().value!);
  return reverts;
}

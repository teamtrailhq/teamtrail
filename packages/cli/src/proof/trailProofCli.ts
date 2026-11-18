import type { MapSnapshot, TrackerAdapter } from '@teamtrail/core';
import { signedTrailProofMarkdown, trailProofFor } from '@teamtrail/core/node';
import { fail } from '../args/help';
import { findProofTrail } from './findProofTrail';

/**
 * `teamtrail proof --trail <trail>`: the proof of a whole trail as this machine recorded it, each ticket's proof and
 * the approved checks run on the default branch with all of their merges, as signed Markdown (`--json` for the
 * structure). Reading it never starts a run. Exit code 0 when the trail is verified, 1 when it isn't.
 */
export async function trailProofCli(o: {
  root: string;
  dir: string;
  trail: string;
  json: boolean;
  tracker: TrackerAdapter;
  snaps: MapSnapshot[];
}) {
  const snap = findProofTrail(o.snaps, o.trail);
  if ('error' in snap) fail(snap.error);
  const decisions = await o.tracker.listDecisions(snap.map.id);
  const proof = await trailProofFor({ env: { root: o.root }, snap, decisions });
  const signed = signedTrailProofMarkdown(o.root, proof);
  process.stdout.write(
    o.json ? `${JSON.stringify({ ...proof, signature: signed.signature }, null, 2)}\n` : `${signed.markdown}\n`,
  );
  if (signed.keyFile)
    process.stderr.write(`Signed with this machine's key; commit ${o.dir}/${signed.keyFile} so others can check it.\n`);
  process.exitCode = proof.status === 'verified' ? 0 : 1;
}

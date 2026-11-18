import path from 'node:path';
import { MarkdownAdapter, type MapSnapshot, type TrackerAdapter } from '@teamtrail/core';
import { activeTracker } from '@teamtrail/core/bridge';
import { nodeMarkdownFs, proofForTicket, signedProofMarkdown } from '@teamtrail/core/node';
import { fail } from '../args/help';
import { findProofTicket } from './findProofTicket';
import { proofVerifyCli } from './proofVerifyCli';
import { trailProofCli } from './trailProofCli';

interface ProofOptions {
  dir: string;
  trail?: string;
  json: boolean;
  ticket?: string;
}

/** `proof <ticket> [--trail <name>] [--json] [--dir <path>]`; without a ticket, `--trail` is the whole trail's proof. */
function parse(argv: string[]): ProofOptions {
  const o: ProofOptions = { dir: '.teamtrail', json: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--json') o.json = true;
    else if (flag === '--dir' || flag === '--trail') {
      const value = argv[++i];
      if (!value) fail(`${flag} needs a value`);
      if (flag === '--dir') o.dir = value;
      else o.trail = value;
    } else if (flag.startsWith('-')) fail(`unknown option: ${flag}`);
    else if (o.ticket) fail(`one ticket at a time: ${o.ticket} or ${flag}?`);
    else o.ticket = flag;
  }
  if (!o.ticket && !o.trail)
    fail('usage: proof <ticket> [--trail <name>] | proof --trail <name> [--json] [--dir <path>]');
  return o;
}

/**
 * `teamtrail proof <ticket>`: the proof of a ticket's completion as this machine recorded it, as Markdown for a pull
 * request (`--json` for the structure); `teamtrail proof --trail <trail>` the whole trail's (trailProofCli.ts). Exit
 * code 0 when it is verified, 1 when it isn't.
 */
export async function proofCli(argv: string[]) {
  if (argv[0] === 'verify') return proofVerifyCli(argv.slice(1));
  const o = parse(argv);
  const root = path.resolve(process.cwd(), o.dir);
  const markdown = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const tracker: TrackerAdapter & { dispose(): void } = activeTracker({ root, markdown, unapproved: 'stay' });
  try {
    const snaps: MapSnapshot[] = await Promise.all((await tracker.listMaps()).map((m) => tracker.loadMap(m.id)));
    if (!o.ticket) return await trailProofCli({ root, dir: o.dir, trail: o.trail!, json: o.json, tracker, snaps });
    const found = findProofTicket({ snaps, ticket: o.ticket!, trail: o.trail });
    if ('error' in found) fail(found.error);
    const decisions = await tracker.listDecisions(found.snap.map.id);
    const proof = proofForTicket({ root, snap: found.snap, ticket: found.ticket, decisions });
    const signed = signedProofMarkdown(root, proof);
    process.stdout.write(
      o.json ? `${JSON.stringify({ ...proof, signature: signed.signature }, null, 2)}\n` : `${signed.markdown}\n`,
    );
    if (signed.keyFile)
      process.stderr.write(
        `Signed with this machine's key; commit ${o.dir}/${signed.keyFile} so others can check it.\n`,
      );
    process.exitCode = proof.status === 'verified' ? 0 : 1;
  } finally {
    tracker.dispose();
  }
}

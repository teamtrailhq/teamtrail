import path from 'node:path';
import { MarkdownAdapter, type MapSnapshot, type TrackerAdapter } from '@teamtrail/core';
import { activeTracker } from '@teamtrail/core/bridge';
import { nodeMarkdownFs, proofForTicket, proofMarkdown } from '@teamtrail/core/node';
import { fail } from '../args/help';
import { findProofTicket } from './findProofTicket';

interface ProofOptions {
  dir: string;
  trail?: string;
  json: boolean;
  ticket?: string;
}

/** `proof <ticket> [--trail <name>] [--json] [--dir <path>]`. */
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
  if (!o.ticket) fail('usage: proof <ticket> [--trail <name>] [--json] [--dir <path>]');
  return o;
}

/**
 * `teamtrail proof <ticket>`: the proof of a ticket's completion as this machine recorded it, as Markdown for a pull
 * request (`--json` for the structure). Exit code 0 when it is verified, 1 when it isn't.
 */
export async function proofCli(argv: string[]) {
  const o = parse(argv);
  const root = path.resolve(process.cwd(), o.dir);
  const markdown = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const tracker: TrackerAdapter & { dispose(): void } = activeTracker({ root, markdown, unapproved: 'stay' });
  try {
    const snaps: MapSnapshot[] = await Promise.all((await tracker.listMaps()).map((m) => tracker.loadMap(m.id)));
    const found = findProofTicket({ snaps, ticket: o.ticket!, trail: o.trail });
    if ('error' in found) fail(found.error);
    const decisions = await tracker.listDecisions(found.snap.map.id);
    const proof = proofForTicket({ root, snap: found.snap, ticket: found.ticket, decisions });
    process.stdout.write(o.json ? `${JSON.stringify(proof, null, 2)}\n` : `${proofMarkdown(proof)}\n`);
    process.exitCode = proof.status === 'verified' ? 0 : 1;
  } finally {
    tracker.dispose();
  }
}

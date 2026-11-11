import path from 'node:path';
import { MarkdownAdapter, type MapSnapshot, type TrackerAdapter } from '@teamtrail/core';
import { activeTracker } from '@teamtrail/core/bridge';
import { nodeMarkdownFs } from '@teamtrail/core/node';
import { fail } from '../args/help';
import { ttyIo } from '../guides/ttyIo';
import { runApprove } from './runApprove';

/** `approve [--dir <path>] [--hash <hash>]…`. */
function parse(argv: string[]) {
  const o = { dir: '.teamtrail', hashes: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag !== '--dir' && flag !== '--hash') fail(`unknown option: ${flag}`);
    if (!value) fail(`${flag} needs a value`);
    if (flag === '--dir') o.dir = value;
    else o.hashes.push(value);
    i++;
  }
  return o;
}

/** Every trail of the tracker approved on this machine, for their verification levels; none when unreachable. */
async function snapsOf(root: string): Promise<MapSnapshot[]> {
  const markdown = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const tracker: TrackerAdapter & { dispose(): void } = activeTracker({ root, markdown, unapproved: 'stay' });
  try {
    return await Promise.all((await tracker.listMaps()).map((m) => tracker.loadMap(m.id)));
  } catch {
    return [];
  } finally {
    tracker.dispose();
  }
}

export async function approveCli(argv: string[]) {
  const o = parse(argv);
  const root = path.resolve(process.cwd(), o.dir);
  process.exitCode = await runApprove({ root, io: ttyIo(), hashes: o.hashes, snaps: await snapsOf(root) });
}

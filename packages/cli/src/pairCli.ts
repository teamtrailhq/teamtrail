import path from 'node:path';
import { BRAND } from '@teamtrail/core';
import { mintPairCode, runningLookout } from '@teamtrail/core/bridge';
import { fail } from './args/help';
import { parseSubArgs } from './args/parseArgs';
import { pairLink } from './serve/pairLink';

const WHY: Record<'none' | 'other-folder' | 'unsigned' | 'not-answering', string> = {
  none: `No Lookout is running for this folder. Start it with \`${BRAND.slug}\`: it prints a link to sign in.`,
  'other-folder': `This folder is open in a Lookout started in another folder. Run \`${BRAND.slug} pair\` there.`,
  unsigned: `The Lookout lock in this folder wasn't written by ${BRAND.name} on this machine, so no link is made for it. Restart \`${BRAND.slug}\`.`,
  'not-answering': `The server at the Lookout lock's address didn't prove it is ${BRAND.name}'s Lookout for this folder, so no link is made for it. Restart \`${BRAND.slug}\`.`,
};

/**
 * `teamtrail pair [--dir <path>]`: a new one-time link that signs a browser in to the Lookout running for this
 * folder, once that Lookout proved it is the process its signed lock names (signIn/runningLookout.ts). The code is
 * written straight into the machine store (signIn/pairCodes.ts) for that process only, which the Lookout reads. So whoever can write the user's config dir can make one, as with approvals; that is
 * why `teamtrail connect` keeps agents out of that folder.
 */
export async function pairCli(argv: string[]) {
  const o = parseSubArgs(argv, ['--dir']);
  if (o.rest.length) fail(`unexpected argument: ${o.rest[0]}`);
  const root = path.resolve(process.cwd(), o.dir);
  const lookout = await runningLookout(root);
  if (lookout.kind !== 'running') fail(WHY[lookout.kind]);
  let code: string;
  try {
    code = mintPairCode({ root, kind: 'machine', instance: lookout.instance }).code;
  } catch (e) {
    fail(`Couldn't write to ${BRAND.name}'s config folder (${(e as Error).message}). Run this in your own terminal.`);
  }
  process.stdout.write(
    `\n  ${BRAND.name} · sign in a browser\n\n  ${pairLink(lookout.url, code)}\n\n` +
      `  Open it in the browser you use for the Lookout. It works once, for 10 minutes.\n\n`,
  );
}

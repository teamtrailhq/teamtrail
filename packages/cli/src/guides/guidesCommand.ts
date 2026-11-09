import path from 'node:path';
import { removeGuide } from '@teamtrail/core/agents';
import { guidesAdd } from './guidesAdd';
import { parseGuidesArgs } from './guidesArgs';
import { guidesLint } from './guidesLint';
import { guidesList } from './guidesList';
import { guidesNew } from './guidesNew';
import { guidesSearch } from './guidesSearch';
import { guidesUpdate } from './guidesUpdate';
import { journalGuide } from './journalGuide';
import type { GuidesArgs, GuidesIo } from './types';

export const GUIDES_USAGE = 'usage: guides search|add|new|update|remove|list|lint … (see --help)';

function guidesRemove(a: GuidesArgs, io: GuidesIo) {
  const id = a.rest[0];
  if (!id) {
    io.err('usage: guides remove <id>\n');
    return 2;
  }
  const r = removeGuide({ root: path.resolve(a.dir), id });
  journalGuide(path.resolve(a.dir), { action: 'removed', guide: id });
  io.out(
    `Removed ${id}${r.builtinBack ? '; the built-in guide is back' : ''}. Its approved checks stay in verification.json.\n`,
  );
  return 0;
}

const COMMANDS: Record<string, (a: GuidesArgs, io: GuidesIo) => number | Promise<number>> = {
  add: guidesAdd,
  new: guidesNew,
  update: guidesUpdate,
  remove: guidesRemove,
  list: guidesList,
  search: guidesSearch,
  lint: guidesLint,
};

/** `teamtrail guides …`: runs one subcommand and returns its exit code; errors are printed, never thrown. */
export async function runGuides(argv: string[], io: GuidesIo): Promise<number> {
  const a = parseGuidesArgs(argv);
  if ('error' in a) {
    io.err(`${a.error}\n${GUIDES_USAGE}\n`);
    return 2;
  }
  const run = COMMANDS[a.command];
  if (!run) {
    io.err(`${GUIDES_USAGE}\n`);
    return 2;
  }
  try {
    return await run(a, io);
  } catch (e) {
    io.err(`${(e as Error).message}\n`);
    return 1;
  }
}

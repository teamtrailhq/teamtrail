import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GUIDE_CATALOG_CONTRIBUTING } from '@teamtrail/core';
import { newGuide } from '@teamtrail/core/agents';
import { printFindings } from './printFindings';
import type { GuidesArgs, GuidesIo } from './types';

/** The person's git name, to sign the guide with; empty when git has none. */
function gitName(cwd: string) {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/**
 * `guides new <id>`: writes `guides/<id>.md` from a template that passes the lint, lints it, and says what comes next:
 * edit it, then the trail lead approves it in the Lookout before any agent can use it.
 */
export function guidesNew(a: GuidesArgs, io: GuidesIo): number {
  const id = a.rest[0];
  if (!id) {
    io.err('usage: guides new <id>\n');
    return 2;
  }
  const root = path.resolve(a.dir);
  const author = a.author ?? gitName(path.dirname(root));
  const { file, lint } = newGuide({ root, id, author });
  const shown = path.relative(process.cwd(), file) || file;
  printFindings(io, shown, lint.findings);
  io.out(
    [
      `Wrote ${shown}${lint.ok ? ', and it passes the guide lint' : ''}.`,
      '',
      'Next:',
      `  1. Write its instructions and checklist. Check it with: teamtrail guides lint ${shown}`,
      "  2. Approve it in the Lookout (run teamtrail): Settings → Guides → Write your own. Agents can't use it until you do.",
      `  3. Give tickets the guide "${id}", or put it on a trail's team. Agents see it in list_guides once it's approved.`,
      '',
      `Share it with everyone: ${GUIDE_CATALOG_CONTRIBUTING}`,
      '',
    ].join('\n'),
  );
  return 0;
}

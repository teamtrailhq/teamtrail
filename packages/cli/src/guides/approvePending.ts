import { checkNotice, type GuideDoc } from '@teamtrail/core';
import { approveCheck } from '@teamtrail/core/agents';
import { argvLine } from './argvLine';
import { journalGuide } from './journalGuide';
import { printable } from './printable';
import type { GuidesIo } from './types';

/**
 * Asks the trail lead about each proposed check still waiting for approval, showing its argv. Without a person at the
 * terminal nothing is approved unless `approveAll` (`--approve-checks`) was given explicitly. Returns what is left.
 */
export async function approvePending(input: {
  root: string;
  guide: GuideDoc;
  pending: string[];
  io: GuidesIo;
  approveAll: boolean;
}): Promise<string[]> {
  const { guide, io } = input;
  const left: string[] = [];
  for (const name of input.pending) {
    const spec = guide.proposedChecks[name];
    io.out(printable(`  check ${name}: ${argvLine(spec)}\n`));
    const notice = checkNotice(spec);
    if (notice) io.out(`    ${notice.toUpperCase()}. Approve it only if you know what it does.\n`);
    const yes = await decide(input, name, !!notice);
    if (!yes) {
      left.push(name);
      continue;
    }
    approveCheck({ root: input.root, id: guide.id, name, acknowledged: !!notice });
    journalGuide(input.root, { action: 'check-approved', guide: guide.id, version: guide.version, check: name });
    io.out(`    approved: written to verification.json\n`);
  }
  if (left.length)
    io.out(
      `\n  Not approved yet: ${left.join(', ')}. They don't run until you approve them in the Lookout (Settings → Guides), or rerun with --approve-checks.\n`,
    );
  return left;
}

/** A yes at the terminal, or --approve-checks; an unknown program is never approved in bulk, only at the terminal. */
async function decide(input: { io: GuidesIo; approveAll: boolean; guide: GuideDoc }, name: string, unknown: boolean) {
  if (input.approveAll && !unknown) return true;
  if (!input.io.interactive) return false;
  const ask = unknown
    ? `    I know what it runs: approve ${name} for ${input.guide.id}? [y/N] `
    : `    Approve ${name} for ${input.guide.id}? [y/N] `;
  return input.io.confirm(ask);
}

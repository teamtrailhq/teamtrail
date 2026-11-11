import type { GuideDoc } from '@teamtrail/core';
import { approveCheck } from '@teamtrail/core/agents';
import { argvLine } from './argvLine';
import { journalGuide } from './journalGuide';
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
    io.out(`  check ${name}: ${argvLine(spec)}\n`);
    const yes = await decide(input, name);
    if (!yes) {
      left.push(name);
      continue;
    }
    approveCheck({ root: input.root, id: guide.id, name });
    journalGuide(input.root, { action: 'check-approved', guide: guide.id, version: guide.version, check: name });
    io.out(`    approved: written to verification.json\n`);
  }
  if (left.length)
    io.out(
      `\n  Not approved yet: ${left.join(', ')}. They don't run until you approve them in the Lookout (Settings → Guides), or rerun with --approve-checks.\n`,
    );
  return left;
}

async function decide(input: { io: GuidesIo; approveAll: boolean; guide: GuideDoc }, name: string) {
  if (input.approveAll) return true;
  if (!input.io.interactive) return false;
  return input.io.confirm(`    Approve ${name} for ${input.guide.id}? [y/N] `);
}

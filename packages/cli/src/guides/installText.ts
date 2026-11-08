import { lintGuide, type GuideDoc, type GuideLockSource } from '@teamtrail/core';
import { installGuide } from '@teamtrail/core/agents';
import { approvePending } from './approvePending';
import { journalGuide } from './journalGuide';
import { printFindings } from './printFindings';
import type { GuidesIo } from './types';

const PREVIEW_LINES = 12;

function describe(io: GuidesIo, guide: GuideDoc) {
  const lines = guide.instructions.split('\n');
  const preview = lines.slice(0, PREVIEW_LINES).map((l) => `    │ ${l}`);
  const more = lines.length > PREVIEW_LINES ? [`    │ … ${lines.length - PREVIEW_LINES} more lines`] : [];
  io.out(
    [
      '',
      `  ${guide.name} (${guide.id}) ${guide.version} · by ${guide.author} · ${guide.license}`,
      `  ${guide.summary}`,
      `  For: ${guide.handles.types.join(', ')} tickets · checklist: ${guide.checklist.length} items`,
      `  Requires checks: ${guide.requiresChecks.join(', ') || 'none'}`,
      ...(guide.preferredAgent ? [`  Preferred agent (advisory): ${guide.preferredAgent}`] : []),
      '',
      ...preview,
      ...more,
      '',
    ].join('\n') + '\n',
  );
}

/**
 * Lints a guide file (refusing it on any error, each named by line), shows what it is, copies it into the guides folder
 * and pins it, then asks about each proposed check it wants. Returns the exit code.
 */
export async function installText(input: {
  root: string;
  text: string;
  source: GuideLockSource;
  where: string;
  io: GuidesIo;
  approveAll: boolean;
  expectId?: string;
}): Promise<number> {
  const { io } = input;
  const lint = lintGuide(input.text);
  printFindings(io, input.where, lint.findings);
  if (!lint.ok || !lint.guide) {
    io.err(`Refused: ${input.where} fails the guide lint; nothing was installed.\n`);
    return 1;
  }
  describe(io, lint.guide);
  const r = installGuide({ ...input, by: 'trail lead' });
  journalGuide(input.root, {
    action: r.updated ? 'updated' : 'installed',
    guide: r.guide.id,
    version: r.guide.version,
  });
  io.out(`  ${r.updated ? 'Updated' : 'Added'} ${r.guide.id} ${r.guide.version}, pinned in guides.lock.json.\n`);
  await approvePending({
    root: input.root,
    guide: r.guide,
    pending: r.pendingChecks,
    io,
    approveAll: input.approveAll,
  });
  return 0;
}

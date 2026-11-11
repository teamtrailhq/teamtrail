import { lintGuide, type GuideDoc, type GuideLockSource } from '@teamtrail/core';
import { guideSha, installGuide } from '@teamtrail/core/agents';
import { approvePending } from './approvePending';
import { argvLine } from './argvLine';
import { journalGuide } from './journalGuide';
import { printFindings } from './printFindings';
import type { GuidesIo } from './types';

const bar = (text: string) => text.split('\n').map((l) => `    │ ${l}`);

/** Everything the agent would get and every command the guide proposes: the whole guide, never a preview. */
function wholeGuide(guide: GuideDoc) {
  const checks = Object.entries(guide.proposedChecks).map(([name, spec]) => `    ${name}: ${argvLine(spec)}`);
  return [
    '',
    `  ${guide.name} (${guide.id}) ${guide.version} · by ${guide.author} · ${guide.license}`,
    `  ${guide.summary}`,
    `  For: ${guide.handles.types.join(', ')} tickets`,
    `  Requires checks: ${guide.requiresChecks.join(', ') || 'none'}`,
    `  Proposes check commands:${checks.length ? '' : ' none'}`,
    ...checks,
    ...(guide.preferredAgent ? [`  Preferred agent (advisory): ${guide.preferredAgent}`] : []),
    `  Checklist (${guide.checklist.length} items):`,
    ...guide.checklist.map((c) => `    - ${c}`),
    '',
    '  Instructions, in full:',
    ...bar(guide.instructions),
    '',
  ].join('\n');
}

const NOT_A_REVIEW =
  '  The lint looks for common problems; it is not a review. Read the guide before you approve it.\n';

/**
 * Whether the person approves this exact file: `--sha256` naming its hash, or yes at the terminal. Without a
 * terminal and without the hash nothing is approved, so a script or an agent can't add a guide unseen.
 */
async function approves(input: { io: GuidesIo; sha256?: string; label: string }, sha: string) {
  const { io } = input;
  if (input.sha256) {
    if (input.sha256 === sha) return true;
    io.err(`Refused: ${input.label} is ${sha}, not the ${input.sha256} you named; nothing was installed.\n`);
    return false;
  }
  if (io.interactive) return io.confirm(`  Add and approve ${input.label}? [y/N] `);
  io.err(
    `Not a terminal, so nothing was installed. Read the guide above, then rerun with --sha256 ${sha} to approve exactly this file.\n`,
  );
  return false;
}

/**
 * Lints a guide file (refusing it on any error, each named by line), shows all of it (paged when long) and any
 * `changes` since the installed version, asks the person to approve that exact file, then copies it into the guides
 * folder and pins it, and asks about each proposed check it wants. Returns the exit code.
 */
export async function installText(input: {
  root: string;
  text: string;
  source: GuideLockSource;
  where: string;
  io: GuidesIo;
  approveAll: boolean;
  expectId?: string;
  /** `--sha256`: approve this file without asking, if it is the one named. */
  sha256?: string;
  /** What changed since the installed version, shown after the guide (guides update). */
  changes?: string[];
}): Promise<number> {
  const { io } = input;
  const lint = lintGuide(input.text);
  printFindings(io, input.where, lint.findings);
  if (!lint.ok || !lint.guide) {
    io.err(`Refused: ${input.where} fails the guide lint; nothing was installed.\n`);
    return 1;
  }
  const sha = guideSha(input.text);
  (io.page ?? io.out)(wholeGuide(lint.guide));
  if (input.changes?.length) io.out(`${input.changes.join('\n')}\n\n`);
  io.out(`${NOT_A_REVIEW}  sha256 ${sha}\n`);
  const label = `${lint.guide.id} ${lint.guide.version}`;
  if (!(await approves({ io, sha256: input.sha256, label }, sha))) return 1;
  const r = installGuide({ ...input, by: 'trail lead' });
  journalGuide(input.root, {
    action: r.updated ? 'updated' : 'installed',
    guide: r.guide.id,
    version: r.guide.version,
  });
  io.out(`  ${r.updated ? 'Updated' : 'Added'} ${label}, pinned in guides.lock.json.\n`);
  await approvePending({
    root: input.root,
    guide: r.guide,
    pending: r.pendingChecks,
    io,
    approveAll: input.approveAll,
  });
  return 0;
}

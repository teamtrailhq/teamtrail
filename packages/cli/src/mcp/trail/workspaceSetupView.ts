import type { SetupOutcome } from '@teamtrail/core';

const label = (s: { argv: string[]; cwd: string }) => `${s.argv.join(' ')}${s.cwd !== '.' ? ` in ${s.cwd}` : ''}`;
const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} s`;

/**
 * What the claim tells the agent about the approved setup steps Teamtrail ran in its new worktree: what ran and how
 * long it took, or which step failed, where its log is, and that installing is then up to the agent, in the worktree.
 */
export function workspaceSetupView(setup: SetupOutcome) {
  const ran = setup.steps.map((s) => ({
    step: label(s),
    ...(s.passed ? { took: secs(s.durationMs) } : { failed: true }),
    ...(s.log ? { log: s.log } : {}),
  }));
  if (!setup.failed)
    return { ran, note: 'Teamtrail ran the approved setup steps in your worktree: its dependencies are installed.' };
  return {
    ran,
    note: `Setup failed in your worktree: ${setup.failed}. Install what the checks need in the worktree yourself before you complete (never in the person's own checkout), and tell the human if you can't.`,
  };
}

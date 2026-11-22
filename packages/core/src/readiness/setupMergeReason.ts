import type { SetupNotOnMain } from './setupNotOnMain';

/** What an agent and the human are told while the setup work waits to be merged. */
export function setupMergeReason(s: SetupNotOnMain): string {
  const pr = s.pr ? `its pull request #${s.pr.number}${s.pr.url ? ` (${s.pr.url})` : ''}` : 'it';
  return (
    `The setup work (${s.key}) isn't on the default branch yet: merge ${pr} first. Until then the repo there has no ` +
    'project, so checks on main fail and new implementation work waits; nothing else needs choosing.'
  );
}

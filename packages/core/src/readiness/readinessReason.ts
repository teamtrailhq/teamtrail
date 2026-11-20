import type { ReadinessFinding } from '../model/readiness';

/**
 * What an agent is told while blocking readiness findings hold new implementation work: the first one, how many
 * more, and that only the trail lead lifts it, so it doesn't try to work around it.
 */
export function readinessReason(findings: ReadinessFinding[]): string | undefined {
  const [first, ...rest] = findings;
  if (!first) return undefined;
  const more = rest.length ? ` (and ${rest.length} more)` : '';
  return (
    `Repo not ready: ${first.text}${more}. New implementation work waits until the trail lead fixes it in Settings → ` +
    'Project → Repo readiness or starts this trail anyway; research and reviews go on. Tell the human; don’t work around it.'
  );
}

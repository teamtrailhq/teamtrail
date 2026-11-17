import { journalFile } from '../history/journalFile';
import { MAIN_CHECKS_JOURNAL } from '../model/mainChecks';
import { MAIN_CHOOSER } from './chooseMain';
import { startMainRun, type MainRunEnv, type MainRunStart } from './startMainRun';

/**
 * The trail lead's "Run checks on main": a new run at the default branch's head now, journaled on the trail it was
 * asked from (or project-wide). Re-running is how a fixed main is picked up, and how any choice is looked at again.
 */
export function requestMainRun(env: MainRunEnv, o: { mapId?: string; by?: string } = {}): MainRunStart {
  const by = o.by ?? MAIN_CHOOSER;
  const start = startMainRun(env, by);
  if (start.kind !== 'started') return start;
  journalFile(env.root).append({
    v: 1,
    kind: 'main-checks',
    at: Date.now(),
    mapId: o.mapId ?? MAIN_CHECKS_JOURNAL,
    action: 'run',
    runId: start.run.id,
    actor: by,
    actorKind: 'trail lead',
  });
  return start;
}

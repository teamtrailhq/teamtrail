import { journalFile } from '../history/journalFile';
import type { ReadinessChoice, ReadinessEntry, RepoReadiness } from '../model/readiness';
import { OperationError } from '../planning/operations/operationError';
import { readinessChoice } from './readinessChoices';

/**
 * The trail lead's Start anyway for one trail, past the readiness findings that block now, or its undo: on this
 * machine, journaled. A blocking finding that comes up later holds the trail's work again until they look at it.
 */
export function startAnyway(o: {
  root: string;
  mapId: string;
  readiness: RepoReadiness;
  by: string;
  undo?: boolean;
}): ReadinessChoice | undefined {
  const blocking = o.readiness.findings.filter((f) => f.level === 'blocks').map((f) => f.id);
  if (!o.undo && !blocking.length) throw new OperationError('Nothing about this repo holds work now.');
  const at = Date.now();
  const next = readinessChoice(o.root, o.mapId, () => (o.undo ? undefined : { at, by: o.by, findings: blocking }));
  const entry: ReadinessEntry = {
    v: 1,
    kind: 'readiness',
    at,
    mapId: o.mapId,
    action: o.undo ? 'undo-start-anyway' : 'start-anyway',
    findings: o.undo ? [] : blocking,
    actor: o.by,
    actorKind: 'trail lead',
  };
  journalFile(o.root).append(entry);
  return next;
}

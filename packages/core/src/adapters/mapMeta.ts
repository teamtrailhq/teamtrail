import type { MapMetaPatch } from '../model/lifecycle';
import type { MapDoc } from '../model/types';

/** `m` with `patch` applied; `null` clears a field. */
export function withMapMeta(m: MapDoc, patch: MapMetaPatch): MapDoc {
  const next: MapDoc = { ...m };
  if (patch.verification === null) delete next.verification;
  else if (patch.verification) next.verification = patch.verification;
  if (patch.modelMatching === null) delete next.modelMatching;
  else if (patch.modelMatching) next.modelMatching = patch.modelMatching;
  return next;
}

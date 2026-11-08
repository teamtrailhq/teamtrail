import type { MapMetaPatch } from '../model/lifecycle';
import type { MapDoc } from '../model/types';

/** `m` with `patch` applied; `null` clears a field. */
export function withMapMeta(m: MapDoc, patch: MapMetaPatch): MapDoc {
  const next: MapDoc = { ...m };
  if (patch.verification === null) delete next.verification;
  else if (patch.verification) next.verification = patch.verification;
  if (patch.guides === null || patch.guides?.length === 0) delete next.guides;
  else if (patch.guides) next.guides = patch.guides;
  return next;
}

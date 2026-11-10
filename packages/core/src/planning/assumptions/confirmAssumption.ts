import type { TrackerAdapter } from '../../adapters/adapter';
import type { Assumption } from '../../model/assumption';
import { OperationError } from '../operations/operationError';

/**
 * The trail lead's call that an assumption holds for good: it's `confirmed`, with who confirmed it. Only holding and
 * challenged assumptions can be confirmed; an invalidated one stays invalidated. Agents can't call this.
 */
export async function confirmAssumption(
  adapter: TrackerAdapter,
  input: {
    mapId: string;
    id: string;
    by: string;
    /** The text the trail lead was shown: refused when it changed. */ shown?: string;
  },
) {
  const snap = await adapter.loadMap(input.mapId);
  const all = snap.map.sections.assumptions ?? [];
  const target = all.find((a) => a.id === input.id);
  if (!target) throw new OperationError(`unknown assumption ${input.id}`);
  if (input.shown !== undefined && input.shown !== target.text)
    throw new OperationError(`${target.id} changed since you read it: it now says "${target.text}". Review it again.`);
  if (target.status === 'invalidated') throw new OperationError(`${target.id} was invalidated and can't be confirmed`);
  if (target.status === 'confirmed') return target;
  const confirmed: Assumption = { ...target, status: 'confirmed', decidedBy: input.by };
  await adapter.updateMapSections(input.mapId, { assumptions: all.map((a) => (a.id === target.id ? confirmed : a)) });
  return confirmed;
}

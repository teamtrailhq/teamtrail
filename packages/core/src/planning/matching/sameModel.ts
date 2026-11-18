import { modelIdentity } from './modelIdentity';

/** The model both ids name (normalised, modelIdentity.ts), when both are known and the same; undefined otherwise. */
export function sameModel(a: string | undefined, b: string | undefined): string | undefined {
  const x = modelIdentity(a);
  const y = modelIdentity(b);
  return x && y && x.id === y.id ? x.id : undefined;
}

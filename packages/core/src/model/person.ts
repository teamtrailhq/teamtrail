import { oneLine } from './safeText';

/** A person who acted (answered, decided), as the sign-in in front of the engine knows them. */
export interface Person {
  /** Stable for that person: an embedding server's account id, or `git:<name>` on this machine. */
  id: string;
  /** How to show them. */
  name: string;
}

/** A person kept to their shape: one line each, at most 100 characters; undefined for anything else. */
export function personOf(value: unknown): Person | undefined {
  const v = value as Record<string, unknown> | undefined;
  if (typeof v?.id !== 'string' || typeof v.name !== 'string') return undefined;
  const id = oneLine(v.id).slice(0, 100);
  const name = oneLine(v.name).slice(0, 100);
  return id && name ? { id, name } : undefined;
}

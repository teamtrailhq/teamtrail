import { mkdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { ReadinessChoice } from '../model/readiness';

/*
 * The trail lead's Start anyway past blocking readiness findings, per trail, on this machine:
 *   <config dir>/projects/<project id>/readiness.json     { "<mapId>": ReadinessChoice }
 * A human's decision that lets work start, so it lives where nothing in the repo can write it.
 */
const FILE = 'readiness.json';

function readAll(root: string): Record<string, ReadinessChoice> {
  try {
    return machineStore(root).read<Record<string, ReadinessChoice>>(FILE) ?? {};
  } catch {
    return {};
  }
}

const valid = (c: unknown): c is ReadinessChoice =>
  !!c && typeof c === 'object' && Array.isArray((c as ReadinessChoice).findings);

/**
 * One trail's Start anyway, or undefined (none, or the store can't be read). With `change`, sets it (or clears it with
 * undefined) under the store's lock and returns what is set now.
 */
export function readinessChoice(
  root: string,
  mapId: string,
  change?: (c: ReadinessChoice | undefined) => ReadinessChoice | undefined,
): ReadinessChoice | undefined {
  if (!change) {
    const c = readAll(root)[mapId];
    return valid(c) ? c : undefined;
  }
  const store = machineStore(root);
  mkdirSync(store.dir, { recursive: true, mode: 0o700 });
  return withFileLock(store.file(`${FILE}.lock`), () => {
    const { [mapId]: was, ...rest } = readAll(root);
    const next = change(valid(was) ? was : undefined);
    store.write(FILE, next ? { ...rest, [mapId]: next } : rest);
    return next;
  });
}

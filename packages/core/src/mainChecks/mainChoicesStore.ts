import { mkdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { TrailMainChoices } from '../model/mainChecks';

/*
 * The trail lead's choices about checks on main, per trail, on this machine:
 *   <config dir>/projects/<project id>/main-checks.json     { "<mapId>": TrailMainChoices }
 * A human's decision, so it lives where nothing in the repo can write it: dropping a check or accepting a failure
 * there would weaken what completions are held to.
 */
const FILE = 'main-checks.json';

export const NO_CHOICES: TrailMainChoices = { known: [], dropped: [] };

function readAll(root: string): Record<string, TrailMainChoices> {
  try {
    return machineStore(root).read<Record<string, TrailMainChoices>>(FILE) ?? {};
  } catch {
    return {};
  }
}

/** One trail's choices; none when nothing was chosen or the store can't be read. */
export function readMainChoices(root: string, mapId: string): TrailMainChoices {
  const c = readAll(root)[mapId];
  if (!c || typeof c !== 'object') return NO_CHOICES;
  return { ...c, known: Array.isArray(c.known) ? c.known : [], dropped: Array.isArray(c.dropped) ? c.dropped : [] };
}

/** Changes one trail's choices under the store's lock, so two changes at once both land. */
export function updateMainChoices(root: string, mapId: string, change: (c: TrailMainChoices) => TrailMainChoices) {
  const store = machineStore(root);
  mkdirSync(store.dir, { recursive: true, mode: 0o700 });
  return withFileLock(store.file(`${FILE}.lock`), () => {
    const all = readAll(root);
    const next = change(readMainChoices(root, mapId));
    store.write(FILE, { ...all, [mapId]: next });
    return next;
  });
}

/**
 * A failing run made again because main moved: the trail lead's Fix main first and Start anyway on it hold for the new
 * run too, on every trail, so moving main neither asks them again nor holds work they let start.
 */
export function carryMainChoices(root: string, from: string, to: string) {
  const store = machineStore(root);
  mkdirSync(store.dir, { recursive: true, mode: 0o700 });
  withFileLock(store.file(`${FILE}.lock`), () => {
    const all = readAll(root);
    const carry = <T extends { runId: string }>(m: T | undefined) => (m?.runId === from ? { ...m, runId: to } : m);
    const next = Object.fromEntries(
      Object.entries(all).map(([id, c]) => [id, { ...c, fixMain: carry(c.fixMain), proceed: carry(c.proceed) }]),
    );
    store.write(FILE, next);
  });
}

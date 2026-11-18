import { readdirSync } from 'node:fs';
import path from 'node:path';
import { EVIDENCE_DIR, readAttempts } from './evidenceStore';

const dirs = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
};

/**
 * When each diff rule last matched a completion, by rule id: the latest `finishedAt` of an attempt that recorded it,
 * across every trail's evidence. Shown next to each rule in Settings, so a rule nothing triggers stands out.
 */
export function rulesLastMatched(root: string): Record<string, number> {
  const out: Record<string, number> = {};
  const base = path.join(root, EVIDENCE_DIR);
  const attempts = dirs(base).flatMap((mapId) =>
    dirs(path.join(base, mapId)).flatMap((ticketId) => readAttempts(root, mapId, ticketId)),
  );
  for (const a of attempts) for (const r of a.rules ?? []) out[r.id] = Math.max(out[r.id] ?? 0, a.finishedAt);
  return out;
}

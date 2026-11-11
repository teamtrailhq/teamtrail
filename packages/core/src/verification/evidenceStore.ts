import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import type { VerificationAttempt, VerificationVerdict } from '../model/verification';

/*
 * What Teamtrail found when a ticket was submitted, local to the machine that ran it:
 *   <tracker dir>/.evidence/<mapId>/<ticketId>/A-<n>.json         VerificationAttempt, written once
 *   <tracker dir>/.evidence/<mapId>/<ticketId>/A-<n>/<check>.log  full check output, secrets redacted
 *   <tracker dir>/.evidence/<mapId>/<ticketId>/V-<n>.json         VerificationVerdict, written once
 *   <tracker dir>/.evidence/.gitignore                            `*`: never committed
 */
export const EVIDENCE_DIR = '.evidence';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

export const evidencePaths = {
  ticket: (mapId: string, ticketId: string) => `${EVIDENCE_DIR}/${safe(mapId)}/${safe(ticketId)}`,
  attempt: (mapId: string, ticketId: string, id: string) => `${evidencePaths.ticket(mapId, ticketId)}/${id}.json`,
  logs: (mapId: string, ticketId: string, id: string) => `${evidencePaths.ticket(mapId, ticketId)}/${id}`,
  verdict: (mapId: string, ticketId: string, id: string) => `${evidencePaths.ticket(mapId, ticketId)}/${id}.json`,
};

const seq = (prefix: 'A' | 'V') => new RegExp(`^${prefix}-(\\d+)\\.json$`);

function numbered(root: string, mapId: string, ticketId: string, prefix: 'A' | 'V') {
  let names: string[] = [];
  try {
    names = readdirSync(path.join(root, evidencePaths.ticket(mapId, ticketId)));
  } catch {
    return [];
  }
  const re = seq(prefix);
  return names
    .map((n) => Number(n.match(re)?.[1]))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
}

/** Creates `file` and fails if it exists: evidence is never rewritten. */
export function writeOnce(root: string, rel: string, value: unknown) {
  ensureLocalDir(path.join(root, EVIDENCE_DIR));
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), JSON.stringify(value, null, 2), { flag: 'wx' });
}

/** Id for the next attempt on a ticket (`A-1`, `A-2`, …). Callers hold the ticket's run lock. */
export const nextAttemptId = (root: string, mapId: string, ticketId: string) =>
  `A-${(numbered(root, mapId, ticketId, 'A').at(-1) ?? 0) + 1}`;

export function writeAttempt(root: string, a: VerificationAttempt) {
  writeOnce(root, evidencePaths.attempt(a.mapId, a.ticketId, a.id), a);
}

export function readAttempt(root: string, mapId: string, ticketId: string, id: string) {
  const a = readJsonFile<VerificationAttempt>(path.join(root, evidencePaths.attempt(mapId, ticketId, id)));
  return a?.v === 1 ? a : undefined;
}

/** A ticket's attempts, oldest first. */
export const readAttempts = (root: string, mapId: string, ticketId: string) =>
  numbered(root, mapId, ticketId, 'A')
    .map((n) => readAttempt(root, mapId, ticketId, `A-${n}`))
    .filter((a): a is VerificationAttempt => !!a);

/** Stores a verdict under the next `V-<n>` id and returns it with that id. */
export function writeVerdict(root: string, v: Omit<VerificationVerdict, 'id'>): VerificationVerdict {
  for (;;) {
    const id = `V-${(numbered(root, v.mapId, v.ticketId, 'V').at(-1) ?? 0) + 1}`;
    const rec = { ...v, id } as VerificationVerdict;
    try {
      writeOnce(root, evidencePaths.verdict(v.mapId, v.ticketId, id), rec);
      return rec;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

/** A ticket's verdicts, oldest first. */
export const readVerdicts = (root: string, mapId: string, ticketId: string) =>
  numbered(root, mapId, ticketId, 'V')
    .map((n) => readJsonFile<VerificationVerdict>(path.join(root, evidencePaths.verdict(mapId, ticketId, `V-${n}`))))
    .filter((v): v is VerificationVerdict => v?.v === 1);

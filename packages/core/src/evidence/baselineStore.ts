import { linkSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile } from '../lib/jsonFile';
import { machineId } from '../machine/machineId';
import { machineSign, machineSigned } from '../machine/machineKey';
import { machineStore } from '../machine/machineStore';
import type { GitBaseline } from '../model/evidence';

/*
 * The worktree as each claim found it, in this machine's store, never the repo:
 *   <config dir>/projects/<project id>/baselines/<mapId>--<ticketId>/baseline-<n>.json
 *     `{ v: 1, baseline: GitBaseline, mac }`   0600 in 0700 folders, created exclusively, signed with the machine key
 * Git evidence and the check guard measure a completion from it: the commit the work started on, the files already
 * dirty, the worktree to read. An agent that can write the repo could move a baseline kept there (and earlier versions
 * kept it in `.evidence/`, which is never read now); here it can't, and a record this machine's Teamtrail didn't
 * write, or that was edited, counts as no baseline at all, which the guard treats as a change it couldn't read.
 */
const DIR = 'baselines';
const RE = /^baseline-(\d+)\.json$/;

interface Signed {
  v: 1;
  baseline: GitBaseline;
  mac: string;
}

const safe = (s: string) => s.replace(/[^\w-]/g, '_');
const folder = (root: string, mapId: string, ticketId: string) =>
  path.join(machineStore(root).dir, DIR, `${safe(mapId)}--${safe(ticketId)}`);

const macParts = (root: string, b: GitBaseline) => [
  'baseline',
  machineId(root),
  b.mapId,
  b.ticketId,
  JSON.stringify(b),
];

function numbers(dir: string) {
  try {
    return readdirSync(dir)
      .map((n) => Number(n.match(RE)?.[1]))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** The record, only when this machine signed it for this ticket; a key that can't be read counts as unsigned. */
function verified(root: string, o: { mapId: string; ticketId: string; file: string }): GitBaseline | undefined {
  const raw = readJsonFile<Signed>(o.file);
  const b = raw?.baseline;
  if (raw?.v !== 1 || b?.v !== 1 || b.mapId !== o.mapId || b.ticketId !== o.ticketId) return undefined;
  try {
    return machineSigned(macParts(root, b), raw.mac) ? b : undefined;
  } catch {
    return undefined;
  }
}

/** Creates `file` with `text` only if it doesn't exist, whole or not at all: written aside, then hard-linked in. */
function createWhole(file: string, text: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' });
  try {
    linkSync(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
  }
}

export const baselineStore = {
  /** The ticket's most recent baseline as this machine recorded it; undefined when there is none it signed. */
  latest(root: string, mapId: string, ticketId: string): GitBaseline | undefined {
    const dir = folder(root, mapId, ticketId);
    const n = numbers(dir).at(-1);
    return n ? verified(root, { mapId, ticketId, file: path.join(dir, `baseline-${n}.json`) }) : undefined;
  },

  /** Records a new baseline under the next number, signed; returns it with its id. Throws when it can't be kept. */
  add(root: string, rec: Omit<GitBaseline, 'id'>): GitBaseline {
    const dir = folder(root, rec.mapId, rec.ticketId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (;;) {
      const id = `baseline-${(numbers(dir).at(-1) ?? 0) + 1}`;
      const baseline = { ...rec, id } as GitBaseline;
      const signed: Signed = { v: 1, baseline, mac: machineSign(macParts(root, baseline)) };
      try {
        createWhole(path.join(dir, `${id}.json`), `${JSON.stringify(signed, null, 2)}\n`);
        return baseline;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
  },
};

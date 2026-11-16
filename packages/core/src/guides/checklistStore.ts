import path from 'node:path';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { ChecklistAnswer, ChecklistRecord } from '../model/guide';
import { EVIDENCE_DIR, evidencePaths } from '../verification/evidenceStore';

/** `.evidence/<map>/<ticket>/checklist.json`: the latest checklist answers, local like the rest of the evidence. */
const fileOf = (root: string, mapId: string, ticketId: string) =>
  path.join(root, evidencePaths.ticket(mapId, ticketId), 'checklist.json');

export function writeChecklist(root: string, rec: ChecklistRecord) {
  ensureLocalDir(path.join(root, EVIDENCE_DIR));
  writeJsonAtomic(fileOf(root, rec.mapId, rec.ticketId), rec);
}

/** A file from before guides came by type: one guide's answers. */
interface ChecklistRecordV1 {
  v: 1;
  mapId: string;
  ticketId: string;
  guide: { id: string; version: string };
  answers: ChecklistAnswer[];
  by: string;
  at: number;
}

/** The latest answers; a `v: 1` file reads as one guide's. */
export function readChecklist(root: string, mapId: string, ticketId: string): ChecklistRecord | undefined {
  const r = readJsonFile<ChecklistRecord | ChecklistRecordV1>(fileOf(root, mapId, ticketId));
  if (r?.v === 2 && Array.isArray(r.guides)) return r;
  if (r?.v !== 1) return undefined;
  const { guide, answers, ...rest } = r;
  return { ...rest, v: 2, guides: [{ guide, answers }] };
}

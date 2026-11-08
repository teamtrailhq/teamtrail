import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { ChecklistRecord } from '../model/role';
import { EVIDENCE_DIR, evidencePaths } from '../verification/evidenceStore';

/** `.evidence/<map>/<ticket>/checklist.json`: the latest checklist answers, local like the rest of the evidence. */
const fileOf = (root: string, mapId: string, ticketId: string) =>
  path.join(root, evidencePaths.ticket(mapId, ticketId), 'checklist.json');

export function writeChecklist(root: string, rec: ChecklistRecord) {
  const ignore = path.join(root, EVIDENCE_DIR, '.gitignore');
  mkdirSync(path.dirname(ignore), { recursive: true });
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  writeJsonAtomic(fileOf(root, rec.mapId, rec.ticketId), rec);
}

export function readChecklist(root: string, mapId: string, ticketId: string): ChecklistRecord | undefined {
  const r = readJsonFile<ChecklistRecord>(fileOf(root, mapId, ticketId));
  return r?.v === 1 ? r : undefined;
}

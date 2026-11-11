import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contentHash, trustKey, trustLedger } from '../trust/trustLedger';
import { BRIEF_DIR, type DiscoveryBrief } from './brief';
import { parseBrief, serializeBrief } from './briefFile';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

/** `<tracker dir>/briefs/<mapId>.md`. */
export const briefPath = (root: string, mapId: string) => path.join(root, BRIEF_DIR, `${safe(mapId)}.md`);

/** The brief exactly as its file has it, with the file's text: what the trail lead's approval is checked against. */
export function readBriefFile(root: string, mapId: string): { brief: DiscoveryBrief; text: string } | undefined {
  const file = briefPath(root, mapId);
  if (!existsSync(file)) return undefined;
  try {
    const text = readFileSync(file, 'utf8');
    return { brief: parseBrief(mapId, text), text };
  } catch {
    return undefined;
  }
}

/**
 * A trail's brief as this machine trusts it. The file is committed, so anyone who can write the repo can set its
 * status to accepted; it counts as accepted only while its text is the one the trail lead accepted here
 * (trust/trustLedger.ts). Otherwise it reads as submitted, with `approval` saying why, and the gate stays closed.
 */
export function readBrief(root: string, mapId: string): DiscoveryBrief | undefined {
  const read = readBriefFile(root, mapId);
  if (!read || read.brief.status !== 'accepted') return read?.brief;
  const standing = trustLedger(root).standing(trustKey.brief(mapId), contentHash(read.text));
  if (standing === 'approved') return read.brief;
  return { ...read.brief, status: 'submitted', approval: standing };
}

/** Trail ids that have a brief file. */
export function briefIds(root: string): string[] {
  try {
    return readdirSync(path.join(root, BRIEF_DIR))
      .filter((n) => n.endsWith('.md'))
      .map((n) => n.slice(0, -3));
  } catch {
    return [];
  }
}

export function writeBrief(root: string, brief: DiscoveryBrief) {
  mkdirSync(path.join(root, BRIEF_DIR), { recursive: true });
  writeFileSync(briefPath(root, brief.mapId), serializeBrief(brief));
}

/** The trail lead accepted the brief on this machine: `text`, the file as accepting wrote it, opens the gate here. */
export function approveBriefHere(root: string, mapId: string, by: string, text: string) {
  const record = { hash: contentHash(text), at: Date.now(), by, content: text };
  trustLedger(root).set({ [trustKey.brief(mapId)]: record });
}

/** Writes the brief and returns the exact text written. */
export function writeBriefText(root: string, brief: DiscoveryBrief): string {
  const text = serializeBrief(brief);
  mkdirSync(path.join(root, BRIEF_DIR), { recursive: true });
  writeFileSync(briefPath(root, brief.mapId), text);
  return text;
}

/** The trail lead approved skipping discovery: the brief file goes; returns its discovery ticket's id, if any. */
export function dropBrief(root: string, mapId: string): string | undefined {
  const ticketId = readBriefFile(root, mapId)?.brief.ticketId;
  rmSync(briefPath(root, mapId), { force: true });
  return ticketId;
}

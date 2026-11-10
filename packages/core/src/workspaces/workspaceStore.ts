import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { DEFAULT_WORKSPACE_SETTINGS, WORKSPACES_FILE, type WorkspaceRecord, type WorkspaceSettings } from './workspace';
import { parseWorkspaceSettings, serializeWorkspaceSettings } from './workspaceFile';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const recordsDir = (root: string) => path.join(root, AGENTS_DIR, 'workspaces');
const recordFile = (root: string, mapId: string, ticketId: string) =>
  path.join(recordsDir(root), `${safe(mapId)}--${safe(ticketId)}.json`);

export interface WorkspaceSettingsRead {
  settings: WorkspaceSettings;
  errors: string[];
  exists: boolean;
}

/** The project's workspace settings; a missing file means off, a broken one means off plus its errors. */
export function readWorkspaceSettings(root: string): WorkspaceSettingsRead {
  const file = path.join(root, WORKSPACES_FILE);
  if (!existsSync(file)) return { settings: DEFAULT_WORKSPACE_SETTINGS, errors: [], exists: false };
  const parsed = parseWorkspaceSettings(readFileSync(file, 'utf8'));
  return { settings: parsed.settings ?? DEFAULT_WORKSPACE_SETTINGS, errors: parsed.errors, exists: true };
}

export function writeWorkspaceSettings(root: string, s: WorkspaceSettings) {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, WORKSPACES_FILE), serializeWorkspaceSettings(s));
}

export function readWorkspace(root: string, mapId: string, ticketId: string) {
  const r = readJsonFile<WorkspaceRecord>(recordFile(root, mapId, ticketId));
  return r?.v === 1 ? r : undefined;
}

export function writeWorkspace(root: string, r: WorkspaceRecord) {
  ensureLocalDir(path.join(root, AGENTS_DIR));
  writeJsonAtomic(recordFile(root, r.mapId, r.ticketId), r);
}

/** Forgets a worktree once its folder is removed. */
export function dropWorkspace(root: string, mapId: string, ticketId: string) {
  rmSync(recordFile(root, mapId, ticketId), { force: true });
}

/** Every prepared worktree whose folder still exists. */
export function listWorkspaces(root: string): WorkspaceRecord[] {
  let names: string[] = [];
  try {
    names = readdirSync(recordsDir(root)).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names
    .map((n) => readJsonFile<WorkspaceRecord>(path.join(recordsDir(root), n)))
    .filter((r): r is WorkspaceRecord => r?.v === 1 && existsSync(r.path));
}

import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { WorkspaceRecord } from './workspace';
import { readWorkspace } from './workspaceStore';

/*
 * The worktrees Teamtrail itself prepared, by ticket, on this machine:
 *   <config dir>/projects/<project id>/worktrees.json    { "<mapId>--<ticketId>": "<real path>" }
 * `.agents/workspaces/*.json` says where a ticket's worktree is, and an agent can write it; checks run and folders
 * are removed only where Teamtrail prepared one (this record), never in a folder a file names.
 */
const FILE = 'worktrees.json';
const keyOf = (mapId: string, ticketId: string) => `${mapId}--${ticketId}`;

const real = (p: string) => {
  try {
    return realpathSync.native(p);
  } catch {
    return undefined;
  }
};

/** Teamtrail prepared this worktree for this ticket. */
export function recordWorktree(root: string, at: { mapId: string; ticketId: string; path: string }) {
  const store = machineStore(root);
  mkdirSync(store.dir, { recursive: true, mode: 0o700 });
  // two claims preparing worktrees at once both keep their record
  withFileLock(store.file(`${FILE}.lock`), () => {
    const known = store.read<Record<string, string>>(FILE) ?? {};
    store.write(FILE, { ...known, [keyOf(at.mapId, at.ticketId)]: real(at.path) ?? at.path });
  });
}

/** The ticket's workspace record, only when it names the worktree Teamtrail prepared for it here and it exists. */
export function trustedWorkspace(root: string, mapId: string, ticketId: string): WorkspaceRecord | undefined {
  const ws = readWorkspace(root, mapId, ticketId);
  if (!ws || !existsSync(ws.path)) return undefined;
  let prepared: string | undefined;
  try {
    prepared = machineStore(root).read<Record<string, string>>(FILE)?.[keyOf(mapId, ticketId)];
  } catch {
    return undefined;
  }
  return prepared && real(ws.path) === prepared ? ws : undefined;
}

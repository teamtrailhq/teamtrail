import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { AGENTS_DIR } from './agentLink';
import { ignoreAgentsDir } from './ignoreAgentsDir';

/*
 * Which agent charted which tickets (start_trail, add_ticket): before anyone claims a ticket, the agent that charted
 * it may write its criteria. Kept on this machine, next to the leases, so it outlives the connection:
 *   <tracker>/.agents/charted/<mapId>.json
 */
export interface ChartedBy {
  /** The trail name that charted it. */
  agent: string;
  /** Who was behind it (`token:<id>` remote, `local:<id>` a connection here). */
  origin: string;
}

interface ChartedFile {
  v: 1;
  tickets: Record<string, ChartedBy>;
}

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const file = (root: string, mapId: string) => path.join(root, AGENTS_DIR, 'charted', `${safe(mapId)}.json`);

const read = (root: string, mapId: string) => {
  const f = readJsonFile<ChartedFile>(file(root, mapId));
  return f?.v === 1 && f.tickets && typeof f.tickets === 'object' ? f.tickets : {};
};

/** Records that `by` charted these tickets. */
export function recordCharted(root: string, mapId: string, ticketIds: string[], by: ChartedBy) {
  ignoreAgentsDir(root);
  const tickets = { ...read(root, mapId), ...Object.fromEntries(ticketIds.map((id) => [id, by])) };
  writeJsonAtomic(file(root, mapId), { v: 1, tickets } satisfies ChartedFile);
}

/** Who charted a ticket, when an agent did. */
export const chartedBy = (root: string, mapId: string, ticketId: string): ChartedBy | undefined =>
  read(root, mapId)[ticketId];

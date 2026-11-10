import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';

/*
 * What the trail lead approved on this machine, by content:
 *   <config dir>/projects/<project id>/approvals.json   { v: 1, items: { <key>: TrustRecord } }
 * Briefs, criteria, knowledge, the risk policy and the check commands are committed on purpose, so teammates share
 * them, which also means an agent can edit them and a push can bring them. Their files say "accepted" or
 * "confirmed"; this ledger says whether the human, here, approved exactly that content. A file that claims an
 * approval the ledger doesn't hold opens no gate: it is `elsewhere` (never approved here: a teammate's push, a
 * clone, a repo that moved, a project from before approvals were kept here) or `changed` (edited since).
 *
 * Only the trail lead's actions write it (the bridge's this-machine routes). It protects against an agent that can
 * write files in the repo and against a teammate's push. An agent with an unrestricted shell on the same user
 * account can write this folder too, as it can read the user's tokens.
 */
const FILE = 'approvals.json';

export interface TrustRecord {
  /** `sha256:<hex>` of the approved content. */
  hash: string;
  at: number;
  by: string;
  /** The approved content itself, where the effective value or a diff needs it. */
  content?: string;
}

export type TrustStanding = 'approved' | 'elsewhere' | 'changed';

export const contentHash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

type Items = Record<string, TrustRecord>;

export function trustLedger(root: string, configDir?: string) {
  const store = machineStore(root, configDir);
  const all = (): Items => {
    const raw = store.read<{ v?: number; items?: Items }>(FILE);
    return raw?.v === 1 && raw.items && typeof raw.items === 'object' ? raw.items : {};
  };
  const save = (items: Items) => store.write(FILE, { v: 1, items });
  /** Read, change, write, under the ledger's lock: two processes approving at once both keep their approvals. */
  const change = (fn: (items: Items) => Items) => {
    mkdirSync(store.dir, { recursive: true, mode: 0o700 });
    withFileLock(store.file(`${FILE}.lock`), () => save(fn(all())));
  };
  return {
    all,
    get: (key: string): TrustRecord | undefined => all()[key],
    /** How `hash` stands against what was approved here under `key`. */
    standing(key: string, hash: string): TrustStanding {
      const rec = all()[key];
      if (!rec) return 'elsewhere';
      return rec.hash === hash ? 'approved' : 'changed';
    },
    set(entries: Record<string, TrustRecord>) {
      change((items) => ({ ...items, ...entries }));
    },
    drop(key: string) {
      if (!(key in all())) return;
      change(({ [key]: _gone, ...rest }) => rest);
    },
  };
}

/** Ledger keys, one place so every reader and writer agrees. */
export const trustKey = {
  checks: 'checks',
  policy: 'policy',
  brief: (mapId: string) => `brief:${mapId}`,
  criteria: (mapId: string, ticketId: string) => `criteria:${mapId}:${ticketId}`,
  knowledge: (id: string) => `knowledge:${id}`,
  reroute: (mapId: string, id: string) => `reroute:${mapId}:${id}`,
  /** The verification level approved here for a trail, or for one ticket's override. */
  level: (mapId: string, ticketId?: string) => (ticketId ? `level:${mapId}:${ticketId}` : `level:${mapId}`),
  /** A ticket's type as recorded here: which trail level applies to it. */
  type: (mapId: string, ticketId: string) => `type:${mapId}:${ticketId}`,
};

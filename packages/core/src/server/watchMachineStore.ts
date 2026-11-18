import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ACCEPTED_DIR } from '../adapters/remote/acceptedSettingsFile';
import { machineStore } from '../machine/machineStore';
import { STATE_DIR } from '../signedState/stateRecord';
import { SIGN_IN_FILE } from '../signIn/signInStore';

/** The folders of the project's machine store whose records say what the human approved or accepted here. */
const SUBDIRS = ['', STATE_DIR, ACCEPTED_DIR];

/** SSE `trust` event: records in this machine's store changed, by path in the store (`approvals.json`, `signed-state/<trail>.json`). */
export interface TrustEvent {
  files: string[];
}

const stamp = (file: string) => {
  const s = statSync(file, { throwIfNoEntry: false });
  return s?.isFile() ? `${s.ino}|${s.mtimeMs}|${s.ctimeMs}|${s.size}` : undefined;
};

/** Each record file's stamp, by its path in the store; sign-ins are not approvals (they have their own event). */
function records(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const sub of SUBDIRS) {
    let names: string[] = [];
    try {
      names = readdirSync(path.join(dir, sub));
    } catch {
      continue;
    }
    for (const name of names.filter((n) => n.endsWith('.json') && n !== SIGN_IN_FILE)) {
      const rel = sub ? `${sub}/${name}` : name;
      const s = stamp(path.join(dir, rel));
      if (s) out.set(rel, s);
    }
  }
  return out;
}

function changedFiles(before: Map<string, string>, now: Map<string, string>): string[] {
  const keys = new Set([...before.keys(), ...now.keys()]);
  return [...keys].filter((k) => before.get(k) !== now.get(k)).sort();
}

/**
 * Sends a named `trust` SSE event when this project's records in the machine store change: approvals of briefs,
 * criteria, knowledge, the risk policy, guides and check commands (`approvals.json`, `guides-approved.json`), outside
 * changes accepted or signed (`signed-state/`), tracker settings accepted (`tracker-settings/`), waivers and the
 * tickets only the Lookout decides. Those live outside the watched tracker folder and are written by every process
 * (the Lookout in any tab or device, `teamtrail approve`, MCP servers), so they are polled by mtime like
 * watchRemoteAgents. A browser paired or revoked (`sign-in.json`) sends a named `sign-in` event instead, for
 * Settings → Browsers & devices. Returns the stop function.
 */
export function watchMachineStore(input: {
  root: string;
  configDir?: string;
  send: (text: string) => void;
  pollMs?: number;
}): () => void {
  const { send, pollMs = 1000 } = input;
  const dir = machineStore(input.root, input.configDir).dir;
  let last = records(dir);
  let signIns = stamp(path.join(dir, SIGN_IN_FILE));
  const poll = setInterval(() => {
    const signedIn = stamp(path.join(dir, SIGN_IN_FILE));
    if (signedIn !== signIns) send('event: sign-in\ndata: {}\n\n');
    signIns = signedIn;
    const now = records(dir);
    const files = changedFiles(last, now);
    last = now;
    if (!files.length) return;
    const ev: TrustEvent = { files };
    send(`event: trust\ndata: ${JSON.stringify(ev)}\n\n`);
  }, pollMs);
  poll.unref?.();
  return () => clearInterval(poll);
}

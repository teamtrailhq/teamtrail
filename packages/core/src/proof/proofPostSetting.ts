import { machineStore } from '../machine/machineStore';

const FILE = 'proof-post.json';

/**
 * Whether this machine posts proofs to pull requests: off unless the trail lead switched it on here. Kept in the
 * machine store, not the repo: each person's Lookout posts with their own GitHub token, so a committed switch would
 * make every teammate's machine post.
 */
export function proofPostSetting(root: string, dir?: string) {
  const store = machineStore(root, dir);
  return {
    enabled: () => store.read<{ enabled?: unknown }>(FILE)?.enabled === true,
    set: (enabled: boolean) => store.write(FILE, { enabled, changedAt: Date.now() }),
  };
}

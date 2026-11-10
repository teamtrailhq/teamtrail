import { machineAccess } from '../machine/machineAccess';
import { machineStore } from '../machine/machineStore';
import { projectConfig, type ProjectTrackerConfig } from './trackerConfig';

/*
 * Where this machine sends and reads the project's trails:
 *   <config dir>/projects/<project id>/tracker-approved.json   outside the repo (machine/machineStore.ts)
 * `trackers.json` is a file in the repo: an agent can edit it and a clone can arrive with it. It says where the
 * project wants its trails; the pin says where the human, on this machine, agreed to keep them. While the two name
 * different trackers, repos or teams, Teamtrail stays on the pinned one and asks. Nothing pinned means local
 * markdown, which sends nothing anywhere.
 */
const FILE = 'tracker-approved.json';
const LOCAL: ProjectTrackerConfig = { active: 'markdown' };

/** The tracker, repo or team a config points at: what the pin compares. Names shown beside it don't count. */
export function trackerTargetKey(c: ProjectTrackerConfig): string {
  if (c.active === 'github') return `github:${(c.github?.repo ?? '').toLowerCase()}`;
  if (c.active === 'linear') return `linear:${c.linear?.teamId ?? ''}:${c.linear?.projectId ?? ''}`;
  return 'markdown';
}

/** A config's target in words: "GitHub Issues in octo-org/launchpad". */
export function trackerTargetLabel(c: ProjectTrackerConfig): string {
  if (c.active === 'github') return `GitHub Issues in ${c.github?.repo ?? 'an unnamed repo'}`;
  if (c.active !== 'linear') return 'local markdown files';
  const team = c.linear?.teamKey ?? c.linear?.teamName ?? c.linear?.teamId ?? 'an unnamed team';
  const project = c.linear?.projectName ?? c.linear?.projectId;
  return `Linear team ${team}${project ? `, project ${project}` : ''}`;
}

export interface ApprovedTracker {
  /** The config in use: `trackers.json` while it names the pinned target, else the pinned config. */
  config: ProjectTrackerConfig;
  /** What `trackers.json` asks for instead, waiting for the human. */
  pending?: ProjectTrackerConfig;
}

export function trackerPin(root: string, configDir?: string) {
  const store = machineStore(root, configDir);
  const project = projectConfig(root);
  const pinned = (): ProjectTrackerConfig => {
    const raw = store.read<{ v?: number; config?: ProjectTrackerConfig }>(FILE);
    return raw?.v === 1 && raw.config?.active ? raw.config : LOCAL;
  };
  return {
    /** The tracker to use now, and the one waiting for approval when `trackers.json` names another. */
    read(): ApprovedTracker {
      const file = project.read();
      const pin = pinned();
      if (trackerTargetKey(file) === trackerTargetKey(pin)) return { config: file };
      return { config: pin, pending: file };
    },
    /** The human chose this target on this machine (Settings, or approving a change to `trackers.json`). */
    approve(config: ProjectTrackerConfig) {
      store.write(FILE, { v: 1, config, approvedAt: Date.now() });
    },
  };
}

/** What a waiting tracker tells an agent: plain, and clear that editing the file again won't help. */
export function pendingTrackerMessage(t: Required<ApprovedTracker>): string {
  // without the config folder nothing approved can be read: that is the problem to name
  const blocked = machineAccess();
  if (blocked) return blocked;
  return (
    `trackers.json now points at ${trackerTargetLabel(t.pending)}, which the trail lead has not approved on this ` +
    `machine (approved here: ${trackerTargetLabel(t.config)}). Nothing is read from or sent to it until they ` +
    'approve it in the Lookout. Editing trackers.json does not switch trackers; tell the human and wait.'
  );
}

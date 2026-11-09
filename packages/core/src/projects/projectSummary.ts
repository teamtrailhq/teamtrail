import type { TrackerAdapter } from '../adapters/adapter';
import { readAgentDocs } from '../agents/agentDocs';
import { readLeases } from '../agents/leaseStore';
import { leaseHealth } from '../agents/ticketLease';
import { attentionView } from '../attention/attentionView';
import { readTicketSyncs } from '../evidence/syncStore';
import type { AttentionView } from '../model/attention';
import type { ProjectEntry, ProjectPhases, ProjectState, ProjectSummary, ProjectTracker } from '../model/project';
import type { MapSnapshot } from '../model/types';
import { derivePhases } from '../planning/lifecycle/phase';
import { projectConfig } from '../server/trackerConfig';

export interface SummaryInput {
  entry: ProjectEntry;
  home: boolean;
  state: ProjectState;
  /** The project's tracker, when it can be read: a file adapter, or the open bridge's active tracker. */
  adapter?: TrackerAdapter;
  /** Where this person's attention prefs live. */
  configDir?: string;
  now?: number;
}

const NO_PHASES: ProjectPhases = { working: 0, verifying: 0, rework: 0, blocked: 0 };

function countPhases(snaps: MapSnapshot[]): ProjectPhases {
  const counts = { ...NO_PHASES };
  for (const s of snaps)
    for (const phase of derivePhases(s.tickets, s.map.mode).values())
      if (phase in counts) counts[phase as keyof ProjectPhases]++;
  return counts;
}

function trackerOf(input: SummaryInput): ProjectTracker {
  const cfg = projectConfig(input.entry.root).read();
  const cached = !!input.adapter;
  if (cfg.active === 'github') return { kind: 'github', cached, repo: cfg.github?.repo };
  if (cfg.active === 'linear') return { kind: 'linear', cached, team: cfg.linear?.teamKey, org: cfg.linear?.orgName };
  return { kind: 'markdown' };
}

/** What a project shows when its folder is gone: the name and path, nothing else, never an error. */
function missingSummary(input: SummaryInput): ProjectSummary {
  const { entry } = input;
  return {
    ...{ id: entry.id, name: entry.name, path: entry.path, home: input.home, state: input.state },
    ...{ tracker: { kind: 'markdown' }, trails: 0, agents: 0, phases: NO_PHASES, questions: 0 },
    ...{ needsYou: 0, interrupting: 0, flags: 0, stalled: 0, note: 'Folder not found' },
  };
}

/**
 * One project at a glance, from its files only: agents running, phase counts, questions, the attention queue,
 * PR flags, quiet claims and the last activity. Returns the attention view too, for the merged queue.
 */
export async function projectSummary(input: SummaryInput): Promise<{ summary: ProjectSummary; view?: AttentionView }> {
  if (input.state.kind === 'missing') return { summary: missingSummary(input) };
  const { entry, adapter } = input;
  const root = entry.root;
  const now = input.now ?? Date.now();
  const docs = await readAgentDocs(root);
  const leases = readLeases(root);
  const snaps = adapter ? await Promise.all((await adapter.listMaps()).map((m) => adapter.loadMap(m.id))) : [];
  const view = adapter ? await attentionView({ root, adapter, configDir: input.configDir, now }) : undefined;
  const touched = [
    ...docs.map((d) => d.updatedAt),
    ...leases.map((l) => l.renewedAt),
    ...snaps.flatMap((s) => s.tickets.map((t) => t.updatedAt)),
  ];
  const top = view?.items[0];
  const summary: ProjectSummary = {
    ...{ id: entry.id, name: entry.name, path: entry.path, home: input.home, state: input.state },
    tracker: trackerOf(input),
    trails: snaps.length,
    agents: docs.filter((d) => d.session.status === 'running').length,
    phases: countPhases(snaps),
    questions: docs.reduce((n, d) => n + d.pending.length, 0),
    needsYou: view?.items.length ?? 0,
    interrupting: view?.interrupting.length ?? 0,
    top: top && { title: top.title.split('\n')[0], kind: top.kind, urgency: top.urgency },
    flags: readTicketSyncs(root).filter((s) => s.flags.length).length,
    stalled: leases.filter((l) => !l.returned && leaseHealth(l, now) !== 'live').length,
    lastActivity: touched.length ? Math.max(...touched) : undefined,
    note: adapter ? undefined : 'Tracker not cached: open the project to load its tickets',
  };
  return { summary, view };
}

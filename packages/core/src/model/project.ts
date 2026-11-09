/**
 * Projects: the repos one person supervises from one Lookout (projects/).
 * Files:
 *   <config dir>/projects.json   ProjectsFile, the registry. Machine-local, never inside a repo.
 * Nothing new is written inside a repo's tracker folder.
 */
import type { Briefing } from '../planning/briefing';
import type { AttentionItem } from './attention';

export const PROJECTS_FILE = 'projects.json';

/** One registered repo. `id` is a short stable hash of the tracker folder's real path. */
export interface ProjectEntry {
  id: string;
  /** Display name: the repo folder's name. */
  name: string;
  /** The repo checkout. */
  path: string;
  /** Its tracker folder (`<path>/.teamtrail` unless `--dir` said otherwise). */
  root: string;
  addedAt: number;
}

/** `<config dir>/projects.json`. */
export interface ProjectsFile {
  v: 1;
  projects: ProjectEntry[];
  /** `teamtrail mcp` and `connect` add their repo on start; off when false. */
  autoRegister: boolean;
}

/**
 * `ok`: readable, and served by this process (or by nobody yet). `missing`: the folder is gone.
 * `elsewhere`: another live `teamtrail` serves it; this process only reads its files and links there.
 */
export type ProjectState = { kind: 'ok' } | { kind: 'missing' } | { kind: 'elsewhere'; url: string };

export type ProjectTracker =
  | { kind: 'markdown' }
  /** A GitHub or Linear tracker; `cached` once this process has it open, else only file-based counts show. */
  | { kind: 'github'; cached: boolean; /** `owner/name` the issues live in. */ repo?: string }
  | {
      kind: 'linear';
      cached: boolean;
      /** The team key the trails live in, and its organization. */
      team?: string;
      org?: string;
    };

/** Ticket counts in the phases that mean work in flight or held up. */
export interface ProjectPhases {
  working: number;
  verifying: number;
  rework: number;
  blocked: number;
}

/** One project at a glance, computed from its files by code (projectSummary.ts). */
export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  /** The project this process was started in: the un-prefixed API serves it. */
  home: boolean;
  state: ProjectState;
  tracker: ProjectTracker;
  trails: number;
  /** Agent sessions running now. */
  agents: number;
  phases: ProjectPhases;
  /** Questions agents are waiting on. */
  questions: number;
  /** Items in the attention queue, and how many of them interrupt now. */
  needsYou: number;
  interrupting: number;
  /** The top of the project's queue. */
  top?: { title: string; kind: AttentionItem['kind']; urgency: AttentionItem['urgency'] };
  /** Tickets with PR/CI flags. */
  flags: number;
  /** Claims whose agent has gone quiet (stalled or expired leases). */
  stalled: number;
  lastActivity?: number;
  /** Why the summary is partial, in plain words. */
  note?: string;
}

/** An attention item with the project it belongs to, for the merged queue. */
export interface ProjectAttentionItem extends AttentionItem {
  projectId: string;
  project: string;
  interrupting: boolean;
}

/** `GET /projects`: every project, home first, and one queue ranked across them. */
export interface ProjectsView {
  /** The home project's id. */
  home: string;
  projects: ProjectSummary[];
  attention: ProjectAttentionItem[];
  autoRegister: boolean;
}

/** `GET /projects/briefing`: what changed in each project since `since`; only projects with changes. */
export interface ProjectsBriefing {
  since: number;
  projects: { projectId: string; project: string; briefing: Briefing }[];
}

import type { TicketType } from './types';

/*
 * Roles: what an agent becomes when it claims a ticket that declares one (reviewer, qa, security, docs, architect, …).
 * A role is data, never code: instructions, a checklist and the checks it requires. Files:
 *   built-in roles                      bundled with Teamtrail (roles/builtin/)
 *   <tracker dir>/roles/<id>.md         installed or hand-written roles; a file with a built-in's id overrides it. Committed.
 *   <tracker dir>/roles.lock.json       RoleLock: the version and sha256 the trail lead approved, and approved checks. Committed.
 *   <tracker dir>/roles.json            RolesConfig: the catalogs to search. Optional; committed.
 *   <tracker dir>/.evidence/<map>/<ticket>/checklist.json   ChecklistRecord: the latest checklist answers. Local.
 */
export const ROLES_DIR = 'roles';
export const ROLES_LOCK_FILE = 'roles.lock.json';
export const ROLES_CONFIG_FILE = 'roles.json';

/** Size caps: an agent reads the whole role on every claim. */
export const ROLE_LIMITS = { bodyBytes: 8 * 1024, checklistItems: 20, itemChars: 200 } as const;

/** A check command a role proposes. It runs only after the trail lead approves it into verification.json. */
export interface ProposedCheck {
  /** argv, never a shell string. */
  run: string[];
  timeoutSec?: number;
  cwd?: string;
}

/** A parsed role file (`roles/<id>.md`): frontmatter fields plus the markdown body as instructions. */
export interface RoleDoc {
  v: 1;
  /** kebab-case, unique; the file name. */
  id: string;
  name: string;
  /** semver */
  version: string;
  summary: string;
  /** The ticket types (and tracker labels) the role is meant for. */
  handles: { types: TicketType[]; labels: string[] };
  /** Check names (verification.json) added to every ticket with this role. Never removes any. */
  requiresChecks: string[];
  proposedChecks: Record<string, ProposedCheck>;
  /** Every item needs an answer when a ticket with this role is completed. */
  checklist: string[];
  /** Advisory only: Teamtrail never picks or starts an agent. */
  preferredAgent?: string;
  author: string;
  license: string;
  homepage?: string;
  instructions: string;
}

/** One problem found in a role file; `line` is 1-based in the whole file. */
export interface RoleFinding {
  line: number;
  rule: string;
  level: 'error' | 'warn';
  message: string;
}

/** Where an installed role came from, as the lockfile records it. */
export type RoleLockSource = 'local' | { registry: string; path: string; commit?: string };

export interface RoleLockEntry {
  version: string;
  /** `sha256:<hex>` of the role file the trail lead approved. */
  sha256: string;
  source: RoleLockSource;
  addedAt: string;
  addedBy: string;
  /** Proposed checks the trail lead approved: name → sha256 of the argv. A changed argv needs approval again. */
  approvedChecks: Record<string, string>;
  /** The required checks of the approved version: still enforced if the file is edited after approval. */
  requiresChecks: string[];
}

/** `<tracker dir>/roles.lock.json`. */
export interface RoleLock {
  v: 1;
  roles: Record<string, RoleLockEntry>;
}

/**
 * `active`: usable. `unapproved`: a file the trail lead hasn't approved yet. `tampered`: the file no longer matches
 * its lock. `invalid`: it doesn't parse or fails the safety lint. Only active roles reach agents.
 */
export type RoleStatus = 'active' | 'unapproved' | 'tampered' | 'invalid';

/** A role as the project has it now: built in or a file, checked against the lock. */
export interface InstalledRole {
  id: string;
  origin: 'builtin' | 'local';
  status: RoleStatus;
  /** Why it isn't active, in plain words. */
  reason?: string;
  /** Missing only when the file doesn't parse. */
  role?: RoleDoc;
  sha256?: string;
  lock?: RoleLockEntry;
  findings: RoleFinding[];
  /** Proposed checks not approved yet (or whose argv changed since). */
  pendingChecks: string[];
  /** A local file with a built-in role's id. */
  overridesBuiltin: boolean;
}

/** An agent's answer to one checklist item. Presence is checked, not truth. */
export interface ChecklistAnswer {
  item: string;
  done: boolean;
  note?: string;
}

/** The latest checklist answers for a ticket. */
export interface ChecklistRecord {
  v: 1;
  mapId: string;
  ticketId: string;
  role: { id: string; version: string };
  answers: ChecklistAnswer[];
  by: string;
  at: number;
}

/** What a claim tells the agent about the role it takes on. */
export interface RolePayload {
  id: string;
  name: string;
  version: string;
  instructions: string;
  checklist: string[];
  requiredChecks: string[];
  preferredAgent?: string;
}

/** `<tracker dir>/roles.json`. */
export interface RolesConfig {
  v: 1;
  registries: { name: string; url: string }[];
}

/** One role in a catalog's `index.json`. */
export interface CatalogEntry {
  id: string;
  version: string;
  /** Relative to the registry URL. */
  path: string;
  sha256: string;
  name?: string;
  summary: string;
  author: string;
  verified: boolean;
  reviewedBy: string[];
  history: { version: string; commit: string; at: string; reviewer?: string }[];
  reported?: boolean;
  types?: TicketType[];
}

/** A catalog's `index.json`, generated by scripts/build-role-catalog.mjs. */
export interface CatalogIndex {
  v: 1;
  /** The catalog repo's web page; report links open its issue form. */
  repo?: string;
  roles: CatalogEntry[];
}

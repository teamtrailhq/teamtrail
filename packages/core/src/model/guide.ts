import type { TicketType } from './types';

/*
 * Guides: what an agent becomes when it claims a ticket that declares one (reviewer, qa, security, docs, architect, …).
 * A guide is data, never code: instructions, a checklist and the checks it requires. Files:
 *   built-in guides                      bundled with Teamtrail (guides/builtin/)
 *   <tracker dir>/guides/<id>.md         installed or hand-written guides; a file with a built-in's id overrides it. Committed.
 *   <tracker dir>/guides.lock.json       GuideLock: the version and sha256 the trail lead approved, and approved checks. Committed.
 *   <tracker dir>/guides.json            GuidesConfig: catalogs to search besides the official one. Optional; committed.
 *   <tracker dir>/.evidence/<map>/<ticket>/checklist.json   ChecklistRecord: the latest checklist answers. Local.
 */
export const GUIDES_DIR = 'guides';
export const GUIDES_LOCK_FILE = 'guides.lock.json';
export const GUIDES_CONFIG_FILE = 'guides.json';

/** Size caps: an agent reads the whole guide on every claim. */
export const GUIDE_LIMITS = { bodyBytes: 8 * 1024, checklistItems: 20, itemChars: 200 } as const;

/** A check command a guide proposes. It runs only after the trail lead approves it into verification.json. */
export interface ProposedCheck {
  /** argv, never a shell string. */
  run: string[];
  timeoutSec?: number;
  cwd?: string;
}

/** A parsed guide file (`guides/<id>.md`): frontmatter fields plus the markdown body as instructions. */
export interface GuideDoc {
  v: 1;
  /** kebab-case, unique; the file name. */
  id: string;
  name: string;
  /** semver */
  version: string;
  summary: string;
  /** The ticket types (and tracker labels) the guide is meant for. */
  handles: { types: TicketType[]; labels: string[] };
  /** Check names (verification.json) added to every ticket with this guide. Never removes any. */
  requiresChecks: string[];
  proposedChecks: Record<string, ProposedCheck>;
  /** Every item needs an answer when a ticket with this guide is completed. */
  checklist: string[];
  /** Advisory only: Teamtrail never picks or starts an agent. */
  preferredAgent?: string;
  author: string;
  license: string;
  homepage?: string;
  instructions: string;
}

/** One problem found in a guide file; `line` is 1-based in the whole file. */
export interface GuideFinding {
  line: number;
  rule: string;
  level: 'error' | 'warn';
  message: string;
}

/** Where an installed guide came from, as the lockfile records it. */
export type GuideLockSource = 'local' | { registry: string; path: string; commit?: string };

/**
 * What the catalog said about a guide when the trail lead added or updated it from there. Display only: it never
 * relaxes a check, and a lock entry edited outside Teamtrail is caught like any other change.
 */
export interface GuideLockReview {
  verified: boolean;
  reviewedBy: string[];
}

export interface GuideLockEntry {
  version: string;
  /** `sha256:<hex>` of the guide file the trail lead approved. */
  sha256: string;
  source: GuideLockSource;
  addedAt: string;
  addedBy: string;
  /** Proposed checks the trail lead approved: name → sha256 of the argv. A changed argv needs approval again. */
  approvedChecks: Record<string, string>;
  /** The required checks of the approved version: still enforced if the file is edited after approval. */
  requiresChecks: string[];
  /** The catalog's review at install time. Missing for local files and for locks written before it was recorded. */
  review?: GuideLockReview;
}

/** `<tracker dir>/guides.lock.json`. */
export interface GuideLock {
  v: 1;
  guides: Record<string, GuideLockEntry>;
}

/**
 * `active`: usable. `unapproved`: a file the trail lead hasn't approved yet. `tampered`: the file no longer matches
 * its lock. `invalid`: it doesn't parse or fails the safety lint. Only active guides reach agents.
 */
export type GuideStatus = 'active' | 'unapproved' | 'tampered' | 'invalid';

/** A guide as the project has it now: built in or a file, checked against the lock. */
export interface InstalledGuide {
  id: string;
  origin: 'builtin' | 'local';
  status: GuideStatus;
  /** Why it isn't active, in plain words. */
  reason?: string;
  /** Missing only when the file doesn't parse. */
  guide?: GuideDoc;
  sha256?: string;
  lock?: GuideLockEntry;
  findings: GuideFinding[];
  /** Proposed checks not approved yet (or whose argv changed since). */
  pendingChecks: string[];
  /** A local file with a built-in guide's id. */
  overridesBuiltin: boolean;
  /**
   * On a built-in guide: a local file with its id that the trail lead hasn't approved on this machine yet. The
   * built-in stays active until they do; the file then replaces it.
   */
  override?: InstalledGuide;
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
  guide: { id: string; version: string };
  answers: ChecklistAnswer[];
  by: string;
  at: number;
}

/** What a claim tells the agent about the guide it takes on. */
export interface GuidePayload {
  id: string;
  name: string;
  version: string;
  instructions: string;
  checklist: string[];
  requiredChecks: string[];
  preferredAgent?: string;
}

/**
 * `<tracker dir>/guides.json`: catalogs to search, in order, before the official one. `official: false` leaves the
 * official catalog out; listing its URL places it where you list it.
 */
export interface GuidesConfig {
  v: 1;
  registries: { name: string; url: string }[];
  official?: boolean;
}

/** The official guide catalog's repo, and its guide to contributing a guide. */
export const GUIDE_CATALOG_REPO = 'https://github.com/teamtrailhq/teamtrail-guides';
/**
 * The official catalog's address. Its Verified is the Teamtrail maintainers' review; any other catalog's Verified is
 * only what that catalog says about itself, and is shown with its host.
 */
export const OFFICIAL_CATALOG_URL = 'https://raw.githubusercontent.com/teamtrailhq/teamtrail-guides/main';
export const GUIDE_CATALOG_CONTRIBUTING = `${GUIDE_CATALOG_REPO}/blob/main/CONTRIBUTING.md`;

/** One guide in a catalog's `index.json`. */
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
  /** A copy of a guide that ships with Teamtrail: listed for reference, already available without adding it. */
  builtin?: boolean;
  types?: TicketType[];
}

/** A catalog's `index.json`, generated by scripts/build-guide-catalog.mjs. */
export interface CatalogIndex {
  v: 1;
  /** The catalog repo's web page; report links open its issue form. */
  repo?: string;
  guides: CatalogEntry[];
}

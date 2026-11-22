import type { RepoFiles } from './checkScreening';
import type { ActorKind } from './lifecycle';
import type { Ecosystem, RepoLayout, RepoProfile, Toolchain } from './repoProfile';
import type { VerificationConfig } from './verification';

/*
 * Repo readiness (readiness/): whether Teamtrail can check work in this repo on this machine. Read from the repo
 * profile, the approved checks and setup steps, screening, and probes of this machine (programs on PATH, installs,
 * a browser, services, variable names). Findings that `block` hold new implementation work, as the review limit
 * does, until they're fixed or the trail lead starts the trail anyway.
 */

/** `blocks`: checks can't run, so no completion can be verified. `warns`: some check may fail. `info`: worth knowing. */
export type ReadinessLevel = 'blocks' | 'warns' | 'info';

/** What a finding is about. */
export type ReadinessKind =
  'checks' | 'check' | 'folder' | 'unit' | 'program' | 'version' | 'install' | 'browser' | 'service' | 'variable';

/** A check a fix would add: exactly as it would be written, argv and folder. */
export interface ReadinessCheck {
  name: string;
  run: string[];
  /** Repo-relative folder, '' for the top. */
  cwd: string;
  /** One of the known check shapes; otherwise adding it needs the person's acknowledgement. */
  known: boolean;
}

/**
 * The one-click fixes: only writes that are the trail lead's approval of exactly what was shown (verification.json,
 * approved in the same step). Nothing is installed, started or given a value.
 */
export type ReadinessFix =
  | { kind: 'add-checks'; checks: ReadinessCheck[] }
  | { kind: 'add-setup'; name: string; run: string[]; cwd: string }
  | { kind: 'set-folder'; check: string; cwd: string };

export interface ReadinessFinding {
  /** Stable while the same thing is wrong: `checks-none`, `program:go`, `install:apps/web`, `variable:DATABASE_URL`. */
  id: string;
  kind: ReadinessKind;
  level: ReadinessLevel;
  /** The unit's folder, when it's about one ('' for the top). */
  unit?: string;
  /** One plain line. */
  text: string;
  /** The evidence: the file read or the probe. */
  why: string;
  /** The approved checks it stops; missing for what concerns them all. */
  checks?: string[];
  fix?: ReadinessFix;
  /** `sha256:` of the fix as shown: applying it must name this hash. */
  fixHash?: string;
  /** What the person does themselves, as commands to copy. */
  howTo?: string[];
}

/** One need of a unit, met or not, for the Hands-on table. */
export interface ReadinessNeed {
  kind: ReadinessKind;
  label: string;
  ok: boolean;
  /** The finding that says what's wrong, when it isn't met. */
  finding?: string;
}

/** One unit of the repo as the readiness screen lists it. */
export interface UnitReadiness {
  dir: string;
  ecosystem: Ecosystem;
  manager?: string;
  manifest: string;
  lockfile?: string;
  memberOf?: string;
  toolchain?: Toolchain;
  needs: ReadinessNeed[];
}

/** Where the probes ran: `here` (this machine runs the checks), `skipped` (checks run elsewhere, or no checkout). */
export type ReadinessProbed = 'here' | 'skipped';

export interface RepoReadiness {
  v: 1;
  /** The profile's basis: what was read. */
  basis: string;
  /** The checks approval this was read against (verification.json's hash, `none` without one): a fix names it. */
  base: string;
  probed: ReadinessProbed;
  checkedAt: number;
  layout: RepoLayout;
  /** Workspace tools and CI files, for the summary line. */
  tools: string[];
  ci: string[];
  units: UnitReadiness[];
  /** Blocking first, then by kind and folder. */
  findings: ReadinessFinding[];
  /** How many findings block. */
  blocking: number;
  /** False when there was no checkout to read: nothing is said then. */
  read: boolean;
}

/** The trail lead's Start anyway for one trail: the blocking findings they let work start past. */
export interface ReadinessChoice {
  at: number;
  by: string;
  findings: string[];
}

/** A Start anyway or its undo, in the trail's journal. */
export interface ReadinessEntry {
  v: 1;
  kind: 'readiness';
  at: number;
  mapId: string;
  action: 'start-anyway' | 'undo-start-anyway';
  findings: string[];
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** What this machine found when it probed: data only, so readiness itself stays pure. */
export interface LocalProbes {
  /** By program name (the checks' and setup steps'): its absolute path when it is on the checks' PATH. */
  programs: Record<string, { path?: string }>;
  /**
   * By toolchain the repo pins (`node`, `python`): its program on PATH, the version it printed, or the version
   * manager whose shim it is (whose version depends on the folder, so it isn't read).
   */
  toolchains: Record<string, { path?: string; version?: string; managed?: string }>;
  /** By unit folder: whether its dependency folder is there. Only units where that can be told. */
  installed: Record<string, boolean>;
  /** A browser the checks can start: where, when found. */
  browser: { found: boolean; where?: string };
  /** By service name: reachable on 127.0.0.1 (Docker: its socket). */
  services: Record<string, boolean>;
  /** Variable names the checks would get, and names set here that they wouldn't. Never values. */
  variables: { passed: string[]; withheld: string[] };
  /** Where the checks run, as findings say it ("in Teamtrail Cloud"); "on this machine" when left out. */
  where?: string;
}

/**
 * How an embedding server probes where its checks run (Cloud: from its sandbox image and the toolchains mise
 * installs), in place of probeLocal.ts: the same data, so readiness reads the same. Undefined: nothing about the
 * machine is said.
 */
export type ReadinessProbe = (o: {
  profile: RepoProfile;
  config?: VerificationConfig;
  files: RepoFiles;
}) => Promise<LocalProbes | undefined>;

/**
 * Where readiness is read from: the repo's files (undefined: no checkout, so nothing is said and nothing held) and
 * how the machine that runs the checks is probed (`true`: this machine, probeLocal.ts; `false`: not at all).
 */
export interface ReadinessHost {
  files: () => RepoFiles | undefined;
  probe: boolean | ReadinessProbe;
}

/** One active trail as the queue sees readiness on it. */
export interface TrailReadiness {
  mapId: string;
  /** The ready tickets held back now. */
  tickets: string[];
  /**
   * Whether blocking findings (none the trail lead started it past) hold any of its open implementation work verified
   * with checks, ready now or later.
   */
  waits: boolean;
  /** Whether the trail lead started it anyway. */
  started: boolean;
}

/** One active trail on the readiness screen (`GET /repo/readiness`). */
export interface ReadinessTrail {
  mapId: string;
  title: string;
  /** Ready tickets held back now. */
  held: number;
  /** Whether blocking findings hold any of its open implementation work verified with checks. */
  waits: boolean;
  startedAnyway?: ReadinessChoice;
}

/** What `GET /repo/readiness` and its writes answer. */
export interface ReadinessView {
  readiness: RepoReadiness;
  trails: ReadinessTrail[];
}

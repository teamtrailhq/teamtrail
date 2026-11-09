import type { RateInfo, TrackerErrorCode } from './http';
import type { SyncStatus } from './sync/types';

export type RemoteKind = 'github' | 'linear';
export type ActiveTracker = 'markdown' | RemoteKind;

/** Where a credential came from. Values never leave the machine running `teamtrail`; only the source is reported. */
export type CredentialSource = 'stored' | 'GITHUB_TOKEN' | 'GH_TOKEN' | 'signed-in' | 'gh' | 'LINEAR_API_KEY';

export interface LinearTarget {
  teamId: string;
  teamKey?: string;
  teamName?: string;
  /** Optional: trails are created in this project and only its trails are listed. */
  projectId?: string;
  projectName?: string;
  /** The Linear organization the team belongs to, saved on connect for "ENG in Octo Inc". */
  orgName?: string;
}

/** `GET <api>/trackers`: what Settings shows. Contains no secrets. */
export interface TrackerSettings {
  active: ActiveTracker;
  github: {
    repo?: string;
    /** `owner/name` of the `origin` remote, offered as the default. */
    detectedRepo?: string;
    auth: CredentialSource | null;
    /** Who the found token signs in as, from `GET /user`; absent when no token was found. */
    account?: GitHubAccount;
    /** Sign in with GitHub: offered when Teamtrail has an OAuth client id; `signedIn` when its token is saved here. */
    signIn: { available: boolean; signedIn: boolean };
    status?: SyncStatus;
  };
  linear: Partial<LinearTarget> & {
    auth: CredentialSource | null;
    /** Who the found key belongs to, from `viewer` and `organization`; absent when no key was found. */
    viewer?: LinearViewer;
    status?: SyncStatus;
  };
}

/** The GitHub account behind a token: a user, or why the lookup failed (a rejected token, an app token). */
export type GitHubAccount =
  { kind: 'user'; login: string } | { kind: 'unknown'; error: string; code?: TrackerErrorCode };

/** One repo in the picker: issues are on and the login can push or triage there. */
export interface GitHubRepoOption {
  /** `owner/name`. */
  fullName: string;
  private: boolean;
  /** ISO time of the last push, for "pushed 3 days ago". */
  pushedAt?: string;
}

/** `GET <api>/trackers/github/repos`: the repos the found token can track issues in. Contains no secrets. */
export type GitHubRepoList =
  | {
      kind: 'ok';
      account: GitHubAccount;
      auth: CredentialSource;
      repos: GitHubRepoOption[];
      /** True when the list stopped at the cap; typing `owner/name` still reaches the rest. */
      truncated: boolean;
      /** This project's repo, from its git `origin`. */
      detectedRepo?: string;
    }
  | { kind: 'no-token' }
  | { kind: 'error'; auth?: CredentialSource; error: string; code?: TrackerErrorCode };

/** The Linear user behind a key and their organization, or why the lookup failed. */
export type LinearViewer =
  | { kind: 'user'; name: string; email?: string; orgName: string }
  | { kind: 'unknown'; error: string; code?: TrackerErrorCode };

/** One team in the Linear picker. */
export interface LinearTeamOption {
  id: string;
  key: string;
  name: string;
  /** ISO time of the team's most recently updated issue, for "Active 3d ago"; absent when it has none. */
  activeAt?: string;
}

/** One project in the optional project picker. */
export interface LinearProjectOption {
  id: string;
  name: string;
  /** Linear's project state: planned, started, paused, completed, canceled, backlog. */
  state?: string;
}

/** Where the key for a Linear lookup comes from: the found one (env or saved), or one pasted in the page. */
export interface LinearLookupRequest {
  apiKey?: string;
  teamId?: string;
}

/** `GET|POST <api>/trackers/linear/teams`: the teams a key can access, and who it belongs to. Contains no secrets. */
export type LinearTeamList =
  | {
      kind: 'ok';
      viewer: LinearViewer;
      /** Null when the key was pasted in the page rather than found. */
      auth: CredentialSource | null;
      teams: LinearTeamOption[];
      /** True when the list stopped at the cap. */
      truncated: boolean;
    }
  | { kind: 'no-key' }
  | { kind: 'error'; auth?: CredentialSource | null; error: string; code?: TrackerErrorCode };

/** `GET|POST <api>/trackers/linear/projects`: the projects of one team. Contains no secrets. */
export type LinearProjectList =
  | { kind: 'ok'; projects: LinearProjectOption[]; truncated: boolean }
  | { kind: 'no-key' }
  | { kind: 'error'; error: string; code?: TrackerErrorCode };

/** `POST <api>/trackers/test` body. Omitted credentials fall back to the stored / detected ones. */
export interface TrackerTestRequest {
  kind: RemoteKind;
  repo?: string;
  token?: string;
  apiKey?: string;
  teamId?: string;
  /** Linear: checked to belong to `teamId` when given. */
  projectId?: string;
}

export interface TrackerTestResult {
  ok: boolean;
  /** `@login` on GitHub, the user's name on Linear. */
  account?: string;
  /** `owner/name`, or `TEAM · Project`. */
  target?: string;
  /** False when the token can read but not write issues; undefined when the tracker does not say. */
  canWrite?: boolean;
  rate?: RateInfo;
  /** Linear: the organization the key belongs to. */
  organization?: string;
  /** Linear: teams the key can see, and the projects of the chosen team. */
  teams?: { id: string; key: string; name: string }[];
  projects?: { id: string; name: string }[];
  error?: string;
  code?: TrackerErrorCode;
}

/** `PUT <api>/trackers` body. Credentials are optional: env / `gh` / stored ones are used when omitted. */
export interface TrackerConnectRequest {
  active: ActiveTracker;
  github?: { repo: string; token?: string };
  linear?: LinearTarget & { apiKey?: string };
}

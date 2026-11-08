import type { CatalogFetch } from '@teamtrail/core/agents';

/** How a `guides` command talks to the person running it; tests pass their own. */
export interface GuidesIo {
  out: (text: string) => void;
  err: (text: string) => void;
  /** True when a person can answer prompts (a TTY). */
  interactive: boolean;
  /** Asks a yes/no question; only called when `interactive`. */
  confirm: (question: string) => Promise<boolean>;
  /** Overrides `fetch` for catalog requests (tests). */
  fetch?: CatalogFetch['fetch'];
}

/** Flags of `guides <command>`. */
export interface GuidesArgs {
  command: string;
  dir: string;
  rest: string[];
  registry?: string;
  verified: boolean;
  approveChecks: boolean;
  json: boolean;
}

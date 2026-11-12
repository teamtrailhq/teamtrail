import type { TokenCipher } from './crypto/TokenCipher';
import type { RateLimit } from './http/RateLimit';
import type { Hub } from './hub/Hub';
import type { Logger, ServiceConfig, ServiceStore } from './types';

/** What every route handler gets. */
export interface ServiceContext {
  config: ServiceConfig;
  store: ServiceStore;
  cipher: TokenCipher;
  hub: Hub;
  log: Logger;
  now: () => number;
  fetch: typeof fetch;
  /** /install and /link, per client address. */
  httpLimit: RateLimit;
  /** Slack event ids already passed on (bounded). */
  recentEvents: Set<string>;
  /** Hashes of the signatures of commands and clicks already handled, with when they can be forgotten. */
  replays: Map<string, number>;
  /** When Scout last told a person in a workspace that their Teamtrail can't take a mention or DM (`team:user`). */
  offlineSaid: Map<string, number>;
  /** Whether an owner is in a channel (`<team>:<channel>:<user>`), until when. */
  members: Map<string, { ok: boolean; until: number }>;
}

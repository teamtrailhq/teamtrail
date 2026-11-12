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
}

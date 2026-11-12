import type { Logger } from './types';

/** One JSON line per event on stdout. Callers pass ids and method names only, never message text or tokens. */
export const log: Logger = (event, fields = {}) => {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
};

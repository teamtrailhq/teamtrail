import { SlackApiError } from '../api';
import { AUTH_CODES } from './constants';

/** Errors that say nothing about the message: Slack or the network is having trouble, so try again later. */
const TRANSIENT = new Set([
  'offline',
  'not_connected',
  'ratelimited',
  'internal_error',
  'fatal_error',
  'request_timeout',
  'service_unavailable',
]);

/**
 * Whether Slack refused this one message (too long, invalid blocks, a channel it can't post to): sending it again
 * would fail again, so it goes to the digest instead and the messages after it still go out. Auth errors and
 * Slack or the network being down are not that: those stop the tick and are retried.
 */
export function refusedForGood(e: unknown): boolean {
  if (!(e instanceof SlackApiError)) return false;
  if (AUTH_CODES.has(e.code) || TRANSIENT.has(e.code)) return false;
  return !/^http_5\d\d$/.test(e.code);
}

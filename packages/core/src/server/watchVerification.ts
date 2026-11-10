import { TrackerError } from '../adapters/remote/http';
import { reconcile } from '../evidence/reconcile';
import { readSyncStatus, writeSyncStatus } from '../evidence/syncStore';
import type { CiProvider, PrSyncStatus, TicketSync, VerificationSyncEvent } from '../model/prEvidence';
import { trustedChecks } from '../verification/checksApproval';
import { redact } from '../verification/redact';
import type { RouteContext } from './routeContext';

/** The configured CI provider, or why there is none (no token, no repo). Never includes the token. */
export type CiAccess = () => Promise<CiProvider | string>;

export interface VerificationWatch {
  /** The last tick's status; `sync-status.json` keeps it across restarts once sync has been on. */
  status(): PrSyncStatus;
  stop(): void;
  /** Runs a tick now (after a trail lead links a PR), or right after the running one. */
  kick(): void;
}

const MAX_BACKOFF_MS = 15 * 60_000;

/**
 * The reconciler loop: every `github.pollSec` it compares tickets with their
 * PRs and CI (evidence/reconcile.ts), writes `sync-status.json`, and sends a
 * named `verification` SSE event (VerificationSyncEvent). Failures back off
 * exponentially; a rate limit waits for the reset. It never changes tickets.
 */
export function watchVerification(
  { root, active }: RouteContext,
  deps: { access: CiAccess; send: (text: string) => void },
  opts: { firstMs?: number; now?: () => number } = {},
): VerificationWatch {
  const { access, send } = deps;
  const now = opts.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let stopped = false;
  let failures = 0;
  let current = readSyncStatus(root);

  const schedule = (ms: number) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void tick(), ms);
    timer.unref?.();
  };

  async function pass(at: number): Promise<{ status: PrSyncStatus; tickets: TicketSync[]; pollMs: number }> {
    // the approved config only: required GitHub checks an edit added or removed wait for the trail lead
    const cfg = trustedChecks(root).config;
    const off = (reason: string) => ({ status: { state: 'off' as const, reason }, tickets: [], pollMs: 60_000 });
    if (!cfg.exists) return off('no verification.json');
    if (!cfg.config) return off('verification.json has errors');
    const { github } = cfg.config;
    if (github.enabled === 'off') return off('github.enabled is off');
    const pollMs = github.pollSec * 1000;
    const provider = await access();
    if (typeof provider === 'string') return { ...off(provider), pollMs };
    const where = { provider: provider.name, repo: provider.repo };
    const r = await reconcile({ root, adapter: await active(), provider, requiredChecks: github.requiredChecks, now });
    const status: PrSyncStatus = r.failures.length
      ? {
          state: 'failed',
          reason: `${r.failures.length} ticket(s) not read: ${r.failures[0]}`,
          ...where,
          lastOkAt: current.lastOkAt,
        }
      : { state: 'ok', ...where, lastOkAt: at };
    return { status, tickets: r.changed, pollMs };
  }

  async function tick() {
    if (stopped) return;
    if (running) return void (again = true);
    running = true;
    const at = now();
    const { lastOkAt } = current;
    let status: PrSyncStatus;
    let tickets: TicketSync[] = [];
    let delay: number;
    try {
      const r = await pass(at);
      ({ status, tickets } = r);
      failures = status.state === 'failed' ? failures + 1 : 0;
      delay = status.state === 'failed' ? Math.min(r.pollMs * 2 ** failures, MAX_BACKOFF_MS) : r.pollMs;
    } catch (e) {
      const reason = redact(String((e as Error)?.message ?? e)).slice(0, 300);
      if (e instanceof TrackerError && e.code === 'rate_limited') {
        delay = Math.max(60_000, (e.resetAt ?? 0) - at);
        status = { state: 'rate-limited', reason, lastOkAt };
      } else {
        failures++;
        delay = Math.min(60_000 * 2 ** failures, MAX_BACKOFF_MS);
        status = { state: 'failed', reason, lastOkAt };
      }
    }
    status = { ...status, lastAttemptAt: at, nextAt: at + delay };
    if (stopped) return;
    if (status.state !== 'off' || current.state !== 'off') writeSyncStatus(root, status);
    current = status;
    const event: VerificationSyncEvent = { kind: 'sync', status, tickets };
    send(`event: verification\ndata: ${JSON.stringify(event)}\n\n`);
    running = false;
    if (again) {
      again = false;
      schedule(0);
    } else schedule(delay);
  }

  schedule(opts.firstMs ?? 2000);
  return {
    status: () => current,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    kick() {
      if (running) again = true;
      else schedule(0);
    },
  };
}

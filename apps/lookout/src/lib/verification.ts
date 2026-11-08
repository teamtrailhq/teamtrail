import {
  type ApprovalItem,
  type AttemptResult,
  type CheckResult,
  type LevelInfo,
  type TicketPhase,
  type VerificationAttempt,
  type VerificationLevel,
  type VerificationVerdict,
} from '@teamtrail/core';
import { apiBase } from './apiBase';

/** A ticket's verification record from `GET /verification/ticket`. */
export interface TicketVerification {
  level: LevelInfo;
  attempts: VerificationAttempt[];
  verdicts: VerificationVerdict[];
  /** The run in progress: who submitted and when it started. */
  running?: { id: string; agent: string; startedAt: number };
}

export type OperatorAction = 'rerun' | 'approve' | 'accept' | 'rework' | 'unblock' | 'level';

export interface ActionRequest {
  action: OperatorAction;
  mapId: string;
  ticketId?: string;
  reason?: string;
  to?: Extract<TicketPhase, 'ready' | 'rework'>;
  level?: VerificationLevel | null;
}

export const RESULT_TEXT: Record<AttemptResult, string> = {
  pass: 'Passed',
  fail: 'Failed',
  error: 'Could not run',
  interrupted: 'Interrupted',
};

export const LEVEL_TEXT: Record<VerificationLevel, string> = {
  off: 'Off',
  checks: 'Checks',
  'checks+review': 'Checks + review',
  'checks+review+human': 'Checks + review + you',
};

/** What each level does when an agent reports a ticket done. */
export const LEVEL_HELP: Record<VerificationLevel, string> = {
  off: 'The agent saying “done” closes the ticket right away.',
  checks:
    'Your checks (tests, lint, typecheck…) run in the repo first. A failure goes back to the agent with the output.',
  'checks+review':
    'After the checks pass, a different agent reviews the change. It is never the agent that did the work.',
  'checks+review+human': 'After checks and review, you approve it in the inbox before the ticket closes.',
};

export const checkOk = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

async function json<T>(r: Response): Promise<T> {
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
}

const api = `${apiBase()}/verification`;

export const verificationApi = {
  /** Undefined without a local server (a static build). */
  ticket: (mapId: string, ticketId: string) =>
    fetch(`${api}/ticket?mapId=${encodeURIComponent(mapId)}&ticketId=${encodeURIComponent(ticketId)}`).then(
      (r) => (r.ok ? (r.json() as Promise<TicketVerification>) : undefined),
      () => undefined,
    ),
  /** Tickets waiting on the trail lead across trails; empty without a local server. */
  inbox: () =>
    fetch(`${api}/inbox`).then(
      (r) => (r.ok ? (r.json() as Promise<{ items: ApprovalItem[] }>).then((b) => b.items) : []),
      () => [] as ApprovalItem[],
    ),
  log: (path: string) =>
    fetch(`${api}/log?path=${encodeURIComponent(path)}`).then((r) => json<{ text: string; clipped: boolean }>(r)),
  act: (req: ActionRequest & { by: string }) =>
    fetch(`${api}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }).then((r) => json<{ attemptId?: string }>(r)),
};

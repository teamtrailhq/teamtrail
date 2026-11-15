import { vendorOf } from '../agents/vendorOf';
import type { Scorecard, ScorecardRow, ScorecardSession, ScorecardTicket } from '../model/scorecard';

/** Fewer tickets than this in a group and it is shown, never compared or suggested. */
export const SCORECARD_MIN_SAMPLE = 10;
export const UNKNOWN_MODEL = 'unknown model';

interface Credited {
  t: ScorecardTicket;
  agent: string;
  model: string;
  costUsd: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Each session's spend split evenly over the tickets it submitted work for, so spend adds up to what was spent. */
function costShares(tickets: ScorecardTicket[], sessions: Map<string, ScorecardSession>) {
  const ticketsOf = new Map<string, Set<string>>();
  for (const t of tickets)
    for (const a of t.attempts)
      if (a.sessionId)
        ticketsOf.set(a.sessionId, (ticketsOf.get(a.sessionId) ?? new Set()).add(`${t.mapId}/${t.ticketId}`));
  const share = new Map<string, number>();
  for (const [id, set] of ticketsOf) {
    const cost = sessions.get(id)?.costUsd ?? 0;
    for (const key of set) share.set(key, (share.get(key) ?? 0) + cost / set.size);
  }
  return share;
}

function row(key: string, items: Credited[], minSample: number, extra: Partial<ScorecardRow> = {}): ScorecardRow {
  const verified = items.filter((i) => i.t.verified);
  const firstTime = items.filter((i) => i.t.verified && i.t.attempts.length === 1 && i.t.attempts[0].result === 'pass');
  const costUsd = items.reduce((n, i) => n + i.costUsd, 0);
  const findings = { info: 0, warn: 0, error: 0 };
  for (const { t } of items) for (const k of ['info', 'warn', 'error'] as const) findings[k] += t.findings[k];
  const attempts = verified.reduce((n, i) => n + i.t.attempts.length, 0);
  return {
    key,
    ...extra,
    tickets: items.length,
    verified: verified.length,
    verifiedFirstTime: firstTime.length,
    firstTimeRate: items.length ? round(firstTime.length / items.length, 3) : 0,
    reworkRate: items.length ? round(items.filter((i) => i.t.attempts.length > 1).length / items.length, 3) : 0,
    attemptsPerVerified: verified.length ? round(attempts / verified.length, 2) : undefined,
    costUsd: round(costUsd, 4),
    costPerVerifiedUsd: verified.length && costUsd ? round(costUsd / verified.length, 4) : undefined,
    medianLeadMs: median(verified.flatMap((i) => (i.t.leadMs === undefined ? [] : [i.t.leadMs]))),
    findings,
    enough: items.length >= minSample,
  };
}

function grouped(
  items: Credited[],
  keyOf: (i: Credited) => string,
  minSample: number,
  extra?: (i: Credited) => Partial<ScorecardRow>,
) {
  const groups = new Map<string, Credited[]>();
  for (const i of items) groups.set(keyOf(i), [...(groups.get(keyOf(i)) ?? []), i]);
  return [...groups]
    .map(([key, list]) => row(key, list, minSample, extra?.(list[0])))
    .sort((a, b) => b.tickets - a.tickets || a.key.localeCompare(b.key));
}

/**
 * How each agent, model and vendor does on this repo's own tickets: verified first time, rework, attempts and cost per
 * verified ticket, time to done and review findings. A ticket is credited to whoever made its first completion, and
 * the model is that session's. Pure: the same records give the same scorecard, and nothing is ranked here.
 */
export function agentScorecard(input: {
  tickets: ScorecardTicket[];
  sessions: ScorecardSession[];
  minSample?: number;
}): Scorecard {
  const minSample = input.minSample ?? SCORECARD_MIN_SAMPLE;
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const shares = costShares(input.tickets, sessions);
  const items: Credited[] = input.tickets
    .filter((t) => t.attempts.length > 0)
    .map((t) => {
      const first = t.attempts[0];
      const model = (first.sessionId && sessions.get(first.sessionId)?.model) || UNKNOWN_MODEL;
      return { t, agent: first.agent, model, costUsd: shares.get(`${t.mapId}/${t.ticketId}`) ?? 0 };
    });
  return {
    minSample,
    tickets: items.length,
    byTypeAndModel: grouped(
      items,
      (i) => `${i.t.type} · ${i.model}`,
      minSample,
      (i) => ({ type: i.t.type, model: i.model }),
    ),
    byModel: grouped(
      items,
      (i) => i.model,
      minSample,
      (i) => ({ model: i.model }),
    ),
    byAgent: grouped(items, (i) => i.agent, minSample),
    byVendor: grouped(items, (i) => vendorOf(i.agent), minSample),
  };
}

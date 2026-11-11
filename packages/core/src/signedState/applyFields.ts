import { isAssumptionStatus } from '../model/assumption';
import { levelOf, TICKET_STATUSES, type TicketStatus } from '../model/lifecycle';
import type { DecisionRecord, MapDoc, MapMode, ModelMatching, Ticket, TicketType } from '../model/types';
import { ASSUMPTION_PREFIX, type FieldValue, type Fields } from './stateFields';

/*
 * The other direction of stateFields.ts: a ticket, trail or decision with the given fields put back, the rest
 * (its text) as it is. Only the keys present are applied, so a partial set changes only those.
 */
const str = (v: FieldValue | undefined) => (typeof v === 'string' && v ? v : undefined);
const strs = (v: FieldValue | undefined) => (Array.isArray(v) ? v : undefined);
const has = (f: Fields, k: string) => Object.prototype.hasOwnProperty.call(f, k);
const parsed = <T>(v: FieldValue | undefined): T | undefined => {
  try {
    return typeof v === 'string' ? (JSON.parse(v) as T) : undefined;
  } catch {
    return undefined;
  }
};

type Setter<T> = (x: T, v: FieldValue) => T;

const TICKET: Record<string, Setter<Ticket>> = {
  type: (t, v) => ({ ...t, type: (str(v) ?? t.type) as TicketType }),
  hitl: (t, v) => ({ ...t, hitl: v === true || undefined }),
  state: (t, v) => ({ ...t, state: v === 'closed' ? 'closed' : 'open' }),
  close_reason: (t, v) => ({ ...t, closeReason: v === 'completed' || v === 'not_planned' ? v : undefined }),
  assignee: (t, v) => ({ ...t, assignee: str(v) }),
  status: (t, v) => ({ ...t, status: TICKET_STATUSES.find((s): s is TicketStatus => s === v) }),
  blocked_by: (t, v) => ({ ...t, blockedBy: strs(v) ?? [] }),
  review_of: (t, v) => ({ ...t, reviewOf: str(v) }),
  verification: (t, v) => ({ ...t, verification: levelOf(str(v)) }),
  checks: (t, v) => ({ ...t, checks: strs(v) }),
  guide: (t, v) => ({ ...t, guide: str(v) }),
};

/** Drops the keys that ended up undefined, so the value reads exactly like one parsed from a file. */
function tidy<T extends object>(x: T): T {
  return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as T;
}

export function withTicketFields(t: Ticket, f: Fields): Ticket {
  const out = Object.entries(f).reduce((acc, [k, v]) => TICKET[k]?.(acc, v) ?? acc, t);
  return tidy(out);
}

function withAssumptions(m: MapDoc, f: Fields): MapDoc {
  const list = m.sections.assumptions;
  if (!list) return m;
  const assumptions = list.map((a) => {
    const v = f[`${ASSUMPTION_PREFIX}${a.id}`];
    return isAssumptionStatus(v) ? { ...a, status: v } : a;
  });
  return { ...m, sections: { ...m.sections, assumptions } };
}

export function withMapFields(m: MapDoc, f: Fields): MapDoc {
  let out: MapDoc = { ...m };
  if (has(f, 'mode')) out.mode = (f.mode === 'plan-only' ? 'plan-only' : 'plan+execute') as MapMode;
  if (has(f, 'verification')) out.verification = levelOf(str(f.verification));
  if (has(f, 'guides')) out.guides = strs(f.guides)?.length ? strs(f.guides) : undefined;
  if (has(f, 'model_matching')) out.modelMatching = parsed<ModelMatching>(f.model_matching);
  out = withAssumptions(out, f);
  return tidy(out);
}

/** A decision with its signed fields; its words (a hash) can't be put back, only the text they came from. */
export function withDecisionFields(d: DecisionRecord, f: Fields): DecisionRecord {
  const out: DecisionRecord = { ...d, source: { ...d.source } };
  if (has(f, 'ticket')) out.ticketId = str(f.ticket);
  if (has(f, 'decided_by')) out.decidedBy = str(f.decided_by) ?? '';
  if (has(f, 'source')) out.source.kind = (str(f.source) ?? 'tracker') as DecisionRecord['source']['kind'];
  if (has(f, 'source_ref')) out.source.ref = str(f.source_ref);
  if (has(f, 'supersedes')) out.supersedes = str(f.supersedes);
  if (has(f, 'superseded_by')) out.supersededBy = str(f.superseded_by);
  if (has(f, 'risk')) out.risk = parsed(f.risk);
  out.source = tidy(out.source);
  return tidy(out);
}

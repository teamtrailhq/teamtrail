import type { TrackerAdapter } from '../adapters/adapter';
import { readCriteria } from '../criteria/criteriaStore';
import { criteriaShownText, setCriteriaConfirmed } from '../criteria/setCriteriaConfirmed';
import { journalFile } from '../history/journalFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import { checkShown } from '../server/shownHash';
import { acceptBrief } from './acceptBrief';
import { readBrief, readBriefFile } from './briefStore';

/** What the page showed as the plan: the brief's hash, and each ticket's criteria with theirs. */
export interface PlanShown {
  mapId: string;
  title: string;
  brief: string;
  criteria: { ticketId: string; ticketKey: string; hash: string }[];
}

type Outcome = { status: number; body: unknown };

const refused = (status: number, error: string): Outcome => ({ status, body: { error } });

/** Every item still as shown, or why not: nothing is approved unless all are. */
function checkAll(root: string, plan: PlanShown): Outcome | undefined {
  const brief = readBrief(root, plan.mapId);
  if (!brief) return refused(404, 'this trail has no discovery brief');
  if (brief.status !== 'submitted') return refused(409, `the brief is ${brief.status}, not submitted`);
  const briefShown = checkShown(plan.brief, readBriefFile(root, plan.mapId)?.text, 'The brief');
  if (!briefShown.ok) return refused(briefShown.status, briefShown.error);
  const current = readCriteria(root, plan.mapId);
  for (const c of plan.criteria) {
    if (!current.find((t) => t.ticketId === c.ticketId)?.criteria.length)
      return refused(409, `${c.ticketKey} has no acceptance criteria now: review the plan again.`);
    const shown = checkShown(c.hash, criteriaShownText(root, plan.mapId, c.ticketId), `The criteria of ${c.ticketKey}`);
    if (!shown.ok) return refused(shown.status, shown.error);
  }
  return undefined;
}

/** One `_trust` line per item approved with the plan. */
function journal(root: string, subject: string, hash: string) {
  journalFile(root).append({
    v: 1,
    kind: 'trust',
    at: Date.now(),
    mapId: TRUST_JOURNAL,
    action: 'approved',
    subject,
    detail: hash,
    actor: 'trail lead',
    actorKind: 'trail lead',
    reason: 'approved with the plan',
  });
}

/**
 * The trail lead approves a trail's plan in one step: the submitted brief and every ticket's acceptance criteria the
 * page showed, each bound to the hash of what it showed (`/briefs/accept` and `/criteria/confirm` semantics). All are
 * checked before any is approved, so a brief or criteria changed meanwhile approve nothing (409). Each item is
 * recorded on this machine and journaled under `_trust`.
 */
export async function approvePlan(o: {
  root: string;
  adapter: () => Promise<TrackerAdapter>;
  plan: PlanShown;
}): Promise<Outcome> {
  const { root, plan } = o;
  const refusal = checkAll(root, plan);
  if (refusal) return refusal;
  const accepted = await acceptBrief({ root, adapter: o.adapter, brief: readBrief(root, plan.mapId)! });
  journal(root, `brief of trail ${plan.mapId}`, plan.brief);
  const tickets = plan.criteria.map((c) => {
    const content = criteriaShownText(root, plan.mapId, c.ticketId);
    const saved = setCriteriaConfirmed({
      root,
      map: { id: plan.mapId, title: plan.title },
      ticket: { id: c.ticketId, key: c.ticketKey },
      confirmed: true,
      content,
    });
    journal(root, `criteria of ${c.ticketKey} in trail ${plan.mapId}`, c.hash);
    return saved;
  });
  return { status: 200, body: { brief: accepted.brief, tickets } };
}

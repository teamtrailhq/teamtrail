import { evidenceLines } from '../evidence/evidenceSummary';
import type { Ticket } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { createReviewTicket, withdrawReviews } from '../planning/lifecycle/reviewTicket';
import { checkLine, criteriaLines } from './outcome';
import { CHECK_RUNNER, type VerifyEnv } from './verifyCompletion';

const MAX_FILES = 20;
/** The guide review tickets take on when the trail's team includes it. */
const REVIEWER = 'reviewer';
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What the reviewer gets: the claim, the code it changed, the checks that passed, and how to answer. */
export function reviewBody(t: Ticket, a: VerificationAttempt) {
  const g = a.git;
  const range = g?.base?.head && g.tree?.head ? `${g.base.head.slice(0, 12)}..${g.tree.head.slice(0, 12)}` : undefined;
  const files = (g?.changed ?? [])
    .slice(0, MAX_FILES)
    .map((f) => `- \`${f.path}\` (+${f.add ?? '?'} −${f.del ?? '?'})`);
  const more = (g?.changed.length ?? 0) - files.length;
  return [
    `Independent review of ${t.key} ${t.title} (${a.id}, checks passed, by ${a.agent}).`,
    '',
    `**Claimed:** ${clip(a.summary ?? a.resolution, 600)}`,
    '',
    ...(g ? evidenceLines(g) : ['Git: not tracked']),
    ...files,
    ...(more > 0 ? [`- and ${more} more`] : []),
    '',
    `**Checks:** ${a.checks.map(checkLine).join(', ') || 'none configured'}`,
    ...criteriaLines(a),
    ...(a.criteria?.claimed?.length ? ['', 'Check the criteria marked ? yourself: nothing here verified them.'] : []),
    '',
    `Read the change${range ? ` (\`git diff ${range}\`)` : ''} against what ${t.key} asks, run what you need, then call \`submit_review\` with PASS, FAIL (findings the author can act on) or NEEDS_HUMAN. You cannot review a ticket you worked on.`,
  ].join('\n');
}

/** Opens a review ticket for a pass that needs review, replacing any left over from an earlier attempt. */
export async function requestReview(env: VerifyEnv, a: VerificationAttempt) {
  const snap = await env.adapter.loadMap(a.mapId);
  const t = snap.tickets.find((x) => x.id === a.ticketId);
  if (!t) return undefined;
  await withdrawReviews(env.adapter, snap, t.id, {
    actor: CHECK_RUNNER,
    reason: `${a.id} replaces the attempt under review`,
    journal: env.journal,
  });
  return createReviewTicket(env.adapter, a.mapId, {
    reviewOf: t.id,
    title: clip(`Review ${t.key}: ${t.title}`, 200),
    body: reviewBody(t, a),
    ...(snap.map.guides?.includes(REVIEWER) ? { guide: REVIEWER } : {}),
  });
}

import { auditDecisions, decisionStatus, type AuditDecision, type MapSnapshot } from '@teamtrail/core';
import { label, md } from '../blocks';
import { ago } from './ago';
import { decidedBy } from './decidedBy';
import { findTrail } from './findTrail';
import type { SlackContext } from './slackContext';
import { trailWorld, type TrailWorld } from './trailWorld';

/** How many decisions one answer lists. */
const SHOWN = 10;

type Listed = { d: AuditDecision; snap: MapSnapshot };

/** The decisions in force on these trails, newest first. Superseded ones are left out. */
async function inForce(w: TrailWorld, snaps: MapSnapshot[]): Promise<Listed[]> {
  const all = await Promise.all(
    snaps.map(async (snap) =>
      auditDecisions(snap, await w.adapter.listDecisions(snap.map.id))
        .filter((d) => decisionStatus(d) === 'active')
        .map((d) => ({ d, snap })),
    ),
  );
  return all.flat().sort((a, b) => b.d.decidedAt - a.d.decidedAt);
}

/** Every word appears in the question or the one-line summary, ignoring case. */
const mentions = (d: AuditDecision, words: string[]) => {
  const hay = `${d.question} ${d.summary} ${d.ticketKey ?? ''}`.toLowerCase();
  return words.every((x) => hay.includes(x));
};

/** One line per decision: its summary, never the full answer, rationale or transcript. */
const line = (x: Listed, now: number) =>
  [
    `*${label(x.d.id)}* ${label(x.d.summary || x.d.question)}`,
    ...(x.d.ticketKey ? [label(x.d.ticketKey)] : []),
    label(x.snap.map.title),
    decidedBy(x.d),
    `${ago(x.d.decidedAt, now)} ago`,
  ].join(' · ');

function reply(o: { listed: Listed[]; heading: string; empty: string; now: number }) {
  if (!o.listed.length) return { text: o.empty };
  const more =
    o.listed.length > SHOWN
      ? [{ type: 'context', elements: [md(`${o.listed.length - SHOWN} more in the Lookout`)] }]
      : [];
  return {
    text: `${o.listed.length} decision${o.listed.length > 1 ? 's' : ''}`,
    blocks: [
      { type: 'context', elements: [md(o.heading)] },
      {
        type: 'section',
        text: md(
          o.listed
            .slice(0, SHOWN)
            .map((x) => line(x, o.now))
            .join('\n'),
        ),
      },
      ...more,
    ],
  };
}

/**
 * `@Scout decisions [trail | words]`: the decisions in force, newest first. A trail's name lists that trail's;
 * other words find the decisions whose question or summary has them all; nothing lists the latest on every trail.
 * One line each, with who made the call (text-derived ones say unverified). Read-only.
 */
export async function decisionsMessage(ctx: SlackContext, arg: string) {
  const w = await trailWorld(ctx);
  const trail = arg
    ? findTrail(
        w.snaps.map((s) => s.map),
        arg,
      )
    : undefined;
  if (trail) {
    const snap = w.snaps.find((s) => s.map.id === trail.id)!;
    const listed = await inForce(w, [snap]);
    const empty = `No decisions on ${label(trail.title)} yet.`;
    return reply({ listed, heading: `Decisions on *${label(trail.title)}*`, empty, now: w.now });
  }
  const listed = await inForce(w, w.snaps);
  if (!arg) return reply({ listed, heading: 'Latest decisions', empty: 'No decisions yet.', now: w.now });
  const words = arg.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = listed.filter((x) => mentions(x.d, words));
  return reply({
    listed: hits,
    heading: `Decisions about “${label(arg)}”`,
    empty: `No decision mentions “${label(arg)}”.`,
    now: w.now,
  });
}

import { webUrl, type ProjectSummary } from '@teamtrail/core';
import type { EdgeTone, MetaPart } from '../../components/ui';
import { ITEM_PARAM, projectHref } from '../../lib/apiBase';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Red when something there interrupts now, amber when work is held up or at risk, neutral otherwise. */
export function projectEdge(p: ProjectSummary): EdgeTone {
  if (p.interrupting > 0) return 'urgent';
  if (p.phases.blocked + p.phases.rework + p.flags + p.stalled > 0 || p.state.kind === 'missing') return 'attention';
  return 'neutral';
}

/** The context line: what needs you, then the work in flight. Zero counts are left out. */
export function projectParts(p: ProjectSummary): MetaPart[] {
  if (p.state.kind === 'missing')
    return [
      { text: 'Missing', strong: true },
      { text: p.path, code: true },
    ];
  const parts: MetaPart[] = [];
  if (p.needsYou)
    parts.push({
      text: `${p.needsYou} ${p.needsYou === 1 ? 'needs' : 'need'} you`,
      strong: true,
      urgent: p.interrupting > 0,
    });
  if (p.agents) parts.push(plural(p.agents, 'agent'));
  const { working, verifying, rework, blocked } = p.phases;
  if (working) parts.push(`${working} working`);
  if (verifying) parts.push(`${verifying} verifying`);
  if (rework) parts.push(`${rework} rework`);
  if (blocked) parts.push(`${blocked} blocked`);
  if (p.flags) parts.push(plural(p.flags, 'PR flag'));
  if (p.stalled) parts.push(plural(p.stalled, 'stalled claim'));
  if (!parts.length) parts.push(p.trails ? 'Nothing waiting' : 'No trails yet');
  const where = trackerWhere(p.tracker);
  if (where) parts.push(where);
  return parts;
}

/** Where the issues live: "Issues in owner/name", "Linear: ENG in Octo Inc"; nothing for local markdown. */
function trackerWhere(t: ProjectSummary['tracker']): string | undefined {
  if (t.kind === 'github' && t.repo) return `Issues in ${t.repo}`;
  if (t.kind !== 'linear' || !t.team) return undefined;
  return t.org ? `Linear: ${t.team} in ${t.org}` : `Linear: ${t.team}`;
}

/** The detail line: the top of its queue, else why the summary is partial, else where it lives. */
export function projectDetail(p: ProjectSummary): string {
  if (p.state.kind === 'elsewhere') return `Served by another Lookout · ${p.state.url}`;
  return p.top?.title ?? p.note ?? p.path;
}

/**
 * Opens a project in place, and with `item` that queue item in it; one another Lookout serves opens there instead.
 * A missing one doesn't open.
 */
export function openProject(p: ProjectSummary, home: string, item?: string) {
  if (p.state.kind === 'missing') return;
  if (p.state.kind === 'elsewhere') {
    const url = webUrl(p.state.url);
    if (!url) return;
    const there = new URL(url);
    if (item) there.searchParams.set(ITEM_PARAM, item);
    window.open(there.toString(), '_blank', 'noopener');
    return;
  }
  location.href = projectHref({ id: p.id, home, tracker: p.tracker.kind, item });
}

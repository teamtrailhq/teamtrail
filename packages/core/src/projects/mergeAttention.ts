import type { AttentionView } from '../model/attention';
import type { ProjectAttentionItem } from '../model/project';

/**
 * One queue across projects: every project's items, tagged with the project, ranked by the same scores each
 * project's queue uses (higher first), then the longest wait, then id so the order is stable. Pure.
 */
export function mergeAttention(
  queues: { projectId: string; project: string; view: AttentionView }[],
): ProjectAttentionItem[] {
  const all = queues.flatMap(({ projectId, project, view }) => {
    const interrupting = new Set(view.interrupting);
    return view.items.map((i) => ({ ...i, projectId, project, interrupting: interrupting.has(i.id) }));
  });
  return all.sort(
    (a, b) =>
      Number(b.interrupting) - Number(a.interrupting) ||
      b.score - a.score ||
      a.since - b.since ||
      `${a.projectId}/${a.id}`.localeCompare(`${b.projectId}/${b.id}`),
  );
}

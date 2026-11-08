import type { ProjectsView } from '@teamtrail/core';
import { EmptyState, SectionHeader } from '../../components/ui';
import { MergedAttentionRow } from './MergedAttentionRow';
import { projectsApi } from './projectsApi';

/** Everything that needs you, ranked across projects by the same scores each project's queue uses. */
export function MergedAttention(props: {
  view: ProjectsView;
  now: number;
  /** Opens the item in its project, as that project's inbox row would. */
  onOpen: (projectId: string, itemId: string) => void;
  onAnswered: () => void;
}) {
  const items = props.view.attention;
  const answerable = (projectId: string) =>
    props.view.projects.find((p) => p.id === projectId)?.state.kind !== 'missing';
  return (
    <section className="pj-section pj-attention">
      <SectionHeader
        title="Needs you"
        count={items.length}
        hot={items.some((i) => i.interrupting)}
        info="One queue across projects, ranked the way each project ranks its own. Answer questions here; the agent in that repo gets the answer."
      />
      {items.length === 0 && <EmptyState title="Nothing needs you" hint="Agents in every project can keep going." />}
      <ul className="pj-list">
        {items.map((item) => (
          <MergedAttentionRow
            key={`${item.projectId}/${item.id}`}
            item={item}
            now={props.now}
            onOpen={() => props.onOpen(item.projectId, item.id)}
            onAnswer={
              item.kind === 'question' && answerable(item.projectId)
                ? (text) => projectsApi.answer(item.projectId, { questionId: item.ref, text }).then(props.onAnswered)
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}

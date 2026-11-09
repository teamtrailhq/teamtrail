import type { LinearProjectList } from '@teamtrail/core';
import { Select } from '../../components/ui';

/** Optional: keep trails in one project of the team. Shown once the team's projects have loaded and it has some. */
export function LinearProjectChoice(props: {
  list?: LinearProjectList;
  value: string;
  onChange: (projectId: string) => void;
}) {
  const { list } = props;
  if (list?.kind !== 'ok' || !list.projects.length) return null;
  const options = [
    { value: '', label: 'All projects' },
    ...list.projects.map((p) => ({ value: p.id, label: p.state ? `${p.name} · ${p.state}` : p.name })),
  ];
  return (
    <label className="field">
      Project (optional)
      <Select aria-label="Project" value={props.value} onChange={props.onChange} options={options} />
    </label>
  );
}

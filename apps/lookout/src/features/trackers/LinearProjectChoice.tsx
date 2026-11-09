import type { LinearProjectList } from '@teamtrail/core';
import { LoadFailed, Loading, Select } from '../../components/ui';

/** Optional: keep trails in one project of the team. A spinner while the projects load, Retry if they didn't. */
export function LinearProjectChoice(props: {
  list?: LinearProjectList;
  value: string;
  onChange: (projectId: string) => void;
  onRetry: () => void;
}) {
  const { list } = props;
  if (!list) return <Loading label="Loading projects…" />;
  if (list.kind === 'error')
    return <LoadFailed what="Couldn't list the team's projects" reason={list.error} onRetry={props.onRetry} />;
  if (list.kind !== 'ok' || !list.projects.length) return null;
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

import type { ProjectSummary } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { ago } from '../../lib';
import { projectDetail, projectEdge, projectParts } from './projectText';

/** One project in All projects: its name, what needs you and the work in flight, and the top of its queue. */
export function ProjectCard(props: { p: ProjectSummary; current: boolean; now: number; onOpen?: () => void }) {
  const { p } = props;
  const detail = projectDetail(p);
  return (
    <Row
      as="li"
      className={`project-card st-${p.state.kind}`}
      edge={projectEdge(p)}
      selected={props.current}
      title={p.name}
      titleText={p.path}
      context={<MetaLine parts={projectParts(p)} />}
      detail={detail}
      detailText={detail}
      trailing={p.lastActivity ? ago(props.now - p.lastActivity) : undefined}
      onOpen={props.onOpen}
    />
  );
}

import type { ProjectsBriefing } from '@teamtrail/core';
import { MetaLine, Row, SectionHeader } from '../../components/ui';
import { ago } from '../../lib';

const count = (n: number, what: string) => n > 0 && `${n} ${what}`;

/** "While you were away", across projects: one row per project where something changed. */
export function AwayBriefing(props: { briefing?: ProjectsBriefing; now: number; onOpen: (id: string) => void }) {
  const rows = props.briefing?.projects ?? [];
  if (!props.briefing || !rows.length) return null;
  return (
    <section className="pj-section pj-briefing">
      <SectionHeader
        title="While you were away"
        count={rows.length}
        info={`What changed in each project since ${ago(props.now - props.briefing.since)} ago`}
      />
      <ul className="pj-list">
        {rows.map(({ projectId, project, briefing: b }) => (
          <Row
            key={projectId}
            as="li"
            edge={b.totals.waiting > 0 ? 'attention' : 'neutral'}
            title={project}
            context={
              <MetaLine
                parts={[
                  count(b.totals.done, 'done'),
                  count(
                    b.trails.reduce((n, t) => n + t.opened.length, 0),
                    'new tickets',
                  ),
                  count(b.totals.agentDecisions, 'agent decisions'),
                  count(b.totals.waiting, 'waiting on you'),
                  count(b.totals.ruledOut, 'ruled out'),
                  count(b.totals.active, 'agents active'),
                ]}
              />
            }
            onOpen={() => props.onOpen(projectId)}
          />
        ))}
      </ul>
    </section>
  );
}

import { useEffect } from 'react';
import { DetailSection, MetaLine, Row } from '../../components/ui';
import { MainCheckOutput, MainChecksBar } from '../main-checks';
import { trailChecksActions } from './trailChecksActions';
import { trailChecksText } from './trailChecksText';
import { useTrailChecks } from './useTrailChecks';

/**
 * The trail's checks on main, together: once every ticket is done and merged, whether the approved checks pass on the
 * default branch with all of it. When they fail, the trail lead adds a fix ticket for agents or runs them again;
 * before then, Run now shows what fails on main as it is, without verifying anything. Nothing while checks are off.
 */
export function TrailChecksSection(props: { mapId: string; now: number; onUrgent?: (urgent: boolean) => void }) {
  const t = useTrailChecks(props.mapId);
  const view = t.view;
  const failing = view?.state.kind === 'failed';
  const { onUrgent } = props;
  useEffect(() => onUrgent?.(failing), [onUrgent, failing]);
  if (!view || view.state.kind === 'off') return null;
  const text = trailChecksText(view, props.now);
  const actions = trailChecksActions(view, { run: () => void t.run(), fixTicket: (id) => void t.fixTicket(id) });
  const failed = view.state.kind === 'running' ? [] : (view.run?.checks.filter((c) => !c.passed) ?? []);
  return (
    <DetailSection label="Checks on main, together" className="trail-checks">
      <Row
        edge={text.edge}
        title={text.title}
        context={<MetaLine parts={text.context} />}
        detail={text.detail}
        detailText={text.detail}
        below={<MainChecksBar actions={actions} busy={t.busy} error={t.error} />}
      />
      {failed.length > 0 && <MainCheckOutput checks={failed} />}
    </DetailSection>
  );
}

import { DetailSection, MetaLine, Row } from '../../components/ui';
import { MainCheckOutput } from './MainCheckOutput';
import { mainChecksActions } from './mainChecksActions';
import { MainChecksBar } from './MainChecksBar';
import { mainChecksText } from './mainChecksText';
import { useMainChecks } from './useMainChecks';

/**
 * The trail at a glance, checks on main: whether the approved checks pass on the default branch, and when they fail,
 * the trail lead's three ways on (fix main first, drop the check for this trail, start anyway), each undoable.
 * Nothing while checks are off.
 */
export function MainChecksSection(props: { mapId: string; now: number }) {
  const m = useMainChecks(props.mapId);
  const view = m.view;
  if (!view || view.state.kind === 'off') return null;
  const text = mainChecksText(view, props.now);
  const actions = mainChecksActions(view, { choose: (c) => void m.choose(c), run: () => void m.run() });
  const failed = view.run?.checks.filter((c) => !c.passed) ?? [];
  return (
    <DetailSection label="Checks on main" className="main-checks">
      <Row
        edge={text.edge}
        title={text.title}
        context={<MetaLine parts={text.context} />}
        detail={text.detail}
        detailText={text.detail}
        below={<MainChecksBar actions={actions} busy={m.busy} error={m.error} />}
      />
      {failed.length > 0 && <MainCheckOutput checks={failed} />}
    </DetailSection>
  );
}

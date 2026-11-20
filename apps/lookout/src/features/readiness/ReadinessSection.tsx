import { BRAND } from '@teamtrail/core';
import { Button, MetaLine } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { FindingList } from './FindingList';
import { summaryParts } from './readinessText';
import { TrailStarts } from './TrailStarts';
import { UnitList } from './UnitList';
import { useReadiness } from './useReadiness';

/**
 * Settings → Project → Repo readiness: whether Teamtrail can check agents' work in this repo here. What blocks holds
 * new implementation work on every trail until it's fixed (one click where that's an approval of what's shown) or
 * the trail lead starts a trail anyway; what only warns says which check may fail. Nothing is installed or started.
 */
export function ReadinessSection(props: { now: number }) {
  const r = useReadiness();
  const view = r.view;
  if (!view) return null;
  const { readiness } = view;
  const started = view.trails.some((t) => t.startedAnyway);
  const trails = readiness.blocking > 0 || started ? view.trails : [];
  return (
    <SettingsSection title="Repo readiness">
      <p className="vf-intro">
        Whether {BRAND.name} can check agents' work in this repo on this machine. Until what blocks is fixed, agents
        start no new implementation work; research and reviews go on. {BRAND.name} never installs or starts anything on
        your machine: setup steps run only in the worktrees it prepares.
      </p>
      <div className="rd-head">
        <MetaLine parts={readiness.read ? summaryParts(readiness) : ['No checkout of this repo to read here']} />
        <Button size="sm" disabled={r.busy} onClick={() => void r.checkAgain()}>
          Check again
        </Button>
      </div>
      {readiness.read && readiness.findings.length === 0 && (
        <p className="rd-ok t-body">Ready: the approved checks can run here.</p>
      )}
      <FindingList findings={readiness.findings} busy={r.busy} onFix={(f, ack) => void r.fix(f, ack)} />
      {trails.length > 0 && <span className="set-field-label">Trails</span>}
      <TrailStarts
        trails={trails}
        now={props.now}
        busy={r.busy}
        onStart={(mapId, undo) => void r.startAnyway(mapId, undo)}
      />
      {r.error && <p className="vf-err">{r.error}</p>}
      {readiness.units.length > 0 && <span className="set-field-label">Folders</span>}
      <UnitList units={readiness.units} />
    </SettingsSection>
  );
}

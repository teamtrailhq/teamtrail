import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { useThisMachine } from '../settings/useThisMachine';
import { adoptLine, LIMITS } from './approvalCopy';
import { OldQueueRow } from './OldQueueRow';
import { TrackerChangeRow } from './TrackerChangeRow';
import { TrustItemRow } from './TrustItemRow';
import { useApprovals } from './useApprovals';

/**
 * What the repo's files ask this machine to trust: the check commands, the tracker, a risk policy that lowers what
 * needs you, verification levels, accepted briefs, confirmed criteria and knowledge, and writes queued before an
 * upgrade. Agents can edit those files and teammates push them, so none of it takes effect here until the trail lead
 * approves it as it is. Approvals live in the config dir.
 */
export function ApprovalsSection() {
  const { view, changed, load, approve, act } = useApprovals();
  const local = useThisMachine() !== false;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  if (!view) return null;
  const run = (work: Promise<string | undefined | void>) => {
    setBusy(true);
    setNote(undefined);
    work.then(
      (n) => (setBusy(false), setNote(n ?? undefined)),
      (e: Error) => (setBusy(false), setNote(e.message)),
    );
  };
  const { items, tracker, oldQueue } = view;
  // together only on this machine's first run, and only what was committed; after that, each on its own
  const committed = view.firstRun ? items.filter((i) => i.committed !== false) : [];
  const waiting = items.length + (tracker ? 1 : 0) + (oldQueue ? 1 : 0);
  return (
    <SettingsSection title="Approvals">
      <p className="vf-intro">
        Some files in the repo tell {BRAND.name} what to trust: the commands checks run, where trails are kept, what
        needs you, how much each trail is checked, and briefs, criteria and knowledge marked accepted. Agents can edit
        those files and teammates push them, so nothing in them takes effect on this machine until you approve it here,
        exactly as it is.
      </p>
      {changed && (
        <div className="sync-line alert ap-changed" role="status">
          <span className="dot" />
          <span>Files changed while you were here. What's below is what you saw.</span>
          <Button size="sm" onClick={load}>
            Review again
          </Button>
        </div>
      )}
      {waiting === 0 && (
        <p className="ap-none t-meta">Nothing waiting. Everything the repo asks for is approved here.</p>
      )}
      {committed.length > 1 && <p className="ap-adopt">{adoptLine(committed.length)}</p>}
      {waiting > 0 && (
        <ul className="ap-list">
          {tracker && (
            <TrackerChangeRow
              tracker={tracker}
              busy={busy}
              local={local}
              onDecide={(use) => run(act('/trackers/approval', { use, target: tracker.target }))}
            />
          )}
          {oldQueue && (
            <OldQueueRow
              queue={oldQueue}
              busy={busy}
              local={local}
              onDecide={(go) =>
                run(act('/trackers/legacy-outbox', { action: go ? 'send' : 'discard', writes: oldQueue.writes }))
              }
            />
          )}
          {items.map((item) => (
            <TrustItemRow key={item.key} item={item} busy={busy} local={local} onApprove={() => run(approve([item]))} />
          ))}
        </ul>
      )}
      {local && committed.length > 1 && (
        <Button disabled={busy || changed} onClick={() => run(approve(committed))}>
          Approve all {committed.length} committed
        </Button>
      )}
      {!local && waiting > 0 && <p className="t-meta">Approve these on the machine {BRAND.name} runs on.</p>}
      {note && <span className="vf-err">{note}</span>}
      <MetaLine className="set-hint" parts={LIMITS} />
    </SettingsSection>
  );
}

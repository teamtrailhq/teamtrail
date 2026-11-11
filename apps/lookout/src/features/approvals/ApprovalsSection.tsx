import { BRAND, type TrustItem } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { useThisMachine } from '../settings/useThisMachine';
import { adoptLine, LIMITS, STATE_NOTE } from './approvalCopy';
import { OldQueueRow } from './OldQueueRow';
import { StateChangeRow } from './StateChangeRow';
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
  // together only on this machine's first run, only what was committed, never an item meant for its own look
  // (alone: a trail without discovery, guide catalogs), and never trail state signed here before
  const adoptable = (i: TrustItem) =>
    !i.alone && (i.kind === 'state' ? view.stateFirstRun && i.standing === 'elsewhere' : view.firstRun);
  const committed = items.filter((i) => i.committed !== false && adoptable(i));
  const waiting = items.length + (tracker ? 1 : 0) + (oldQueue ? 1 : 0);
  return (
    <SettingsSection title="Approvals">
      <p className="vf-intro">
        Some files in the repo tell {BRAND.name} what to trust: the commands checks run, where trails are kept, what
        needs you, how much each trail is checked, and briefs, criteria and knowledge marked accepted. Agents can edit
        those files and teammates push them, so nothing in them takes effect on this machine until you approve it here,
        exactly as it is. The same goes for a trail's state: a ticket closed, retyped, claimed or unblocked, a level or
        mode changed, or a decision written by editing files instead of through {BRAND.name} shows here as changed
        outside {BRAND.name}, and counts only once you accept it.
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
      {items.some((i) => i.kind === 'state') && <p className="ap-note t-meta">{STATE_NOTE}</p>}
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
          {items.map((item) =>
            item.kind === 'state' ? (
              <StateChangeRow
                key={item.key}
                item={item}
                busy={busy}
                local={local}
                onAccept={() => run(approve([item]))}
                onRevert={(remove) => run(act('/trust/revert', { key: item.key, hash: item.hash, remove }))}
              />
            ) : (
              <TrustItemRow
                key={item.key}
                item={item}
                busy={busy}
                local={local}
                onApprove={() => run(approve([item]))}
              />
            ),
          )}
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

import { prSyncView } from '@teamtrail/core';
import { Label, ScoutMark, type MarkState } from '../../components/ui';
import { usePrSync } from '../../hooks';

const MARK: Record<ReturnType<typeof prSyncView>['tone'], MarkState> = {
  ok: 'ok',
  failed: 'error',
  stale: 'syncing',
  unknown: 'idle',
  off: 'idle',
};

/** PR/CI reconciler health, only when it failed or fell behind. Hidden without a server. */
export function PrSyncIndicator({ now }: { now: number }) {
  const s = usePrSync();
  if (!s.reached) return null;
  const v = prSyncView(s.live ? s.status : null, now);
  if (v.tone !== 'failed' && v.tone !== 'stale') return null;
  return (
    <span className={`tracker-chip pr-sync tone-${v.tone}`} title={v.title}>
      <Label size="sm">CI</Label>
      <ScoutMark variant="status" state={MARK[v.tone]} size={13} className="sync-glyph" />
      <span className="tl">{v.label}</span>
    </span>
  );
}

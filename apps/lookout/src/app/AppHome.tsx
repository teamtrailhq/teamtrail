import type { AttentionItem, MapSnapshot, SessionInfo } from '@teamtrail/core';
import {
  HandsOffHome,
  HomeFooter,
  type NeedContext,
  NeedRow,
  NeedsYou,
  PlanNeedRow,
  Progress,
  SinceAway,
} from '../features/hands-off';
import { type LookoutApi, useNow, type useBriefing } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import type { useAttentionUi } from './useAttentionUi';
import type { useLiveTrail } from './useLiveTrail';
import type { useTrailUi } from './useTrailUi';

/**
 * Hands-off's home for the trail on screen, wired to the app: Needs you from the whole queue (a ticket opens in the
 * full-ticket drawer over the home), progress from the live trail, the story since the last visit, today's work.
 */
export function AppHome(props: {
  api: LookoutApi;
  snap: MapSnapshot;
  nav: ReturnType<typeof useAppNavigation>;
  attn: ReturnType<typeof useAttentionUi>;
  live: ReturnType<typeof useLiveTrail>;
  trail: ReturnType<typeof useTrailUi>;
  brief: ReturnType<typeof useBriefing>;
  sessions: SessionInfo[];
  /** Fewer needs show before "Show N more" on a phone. */
  phone: boolean;
  onFullMap: () => void;
  onProofSettings: () => void;
}) {
  const { api, snap, nav, attn, live, trail } = props;
  const now = useNow(5000);
  const view = attn.attention.view;
  const openTicket = (mapId: string, ticketId: string) => {
    nav.openTicket(mapId, ticketId);
    nav.setFullTicket(true);
  };
  const ctx: NeedContext | undefined = view && {
    api,
    view,
    sessions: props.sessions,
    handlers: { ...attn.handlers, openTicket },
    now,
    openTicket,
    openChat: (id) => nav.openChat(id),
    dismiss: attn.attention.dismiss,
  };
  const row = (item: AttentionItem, open: boolean, toggle: () => void) => {
    if (!ctx) return null;
    const p = { key: item.id, item, ctx, open, onToggle: toggle };
    return item.kind === 'brief' ? <PlanNeedRow {...p} /> : <NeedRow {...p} />;
  };
  const working = [...live.live.values()].filter((l) => l.tone === 'working' || (l.tone === 'needs' && l.session));
  const onTicket = (id: string) => openTicket(snap.map.id, id);
  const since = props.brief.sinceAway?.trails.find((t) => t.mapId === snap.map.id);
  return (
    <HandsOffHome
      needs={view && <NeedsYou items={view.items} limit={props.phone ? 3 : 5} row={row} />}
      progress={
        <Progress
          segments={live.segments}
          counts={live.counts}
          proofs={trail.proofs}
          done={trail.done}
          working={working}
          now={now}
          onTicket={onTicket}
          onFullMap={props.onFullMap}
        />
      }
      since={
        <SinceAway
          trail={since}
          since={props.brief.awaySince(snap.map.id)}
          chartedAt={snap.map.createdAt}
          decisions={api.decisions}
          proofs={trail.proofs}
          now={now}
          onTicket={onTicket}
          onSupersede={(d, input) => void api.actions.supersede(d, input)}
        />
      }
      footer={<HomeFooter snap={snap} proofs={trail.proofs} now={now} onSettings={props.onProofSettings} />}
    />
  );
}

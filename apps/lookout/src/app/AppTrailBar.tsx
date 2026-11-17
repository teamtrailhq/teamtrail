import type { ReactNode } from 'react';
import { Panel } from '../components/ui';
import { WaitingOnYou } from '../features/inbox';
import { AgentsAtWork, TrailBar, UpNextList, useTrailBarMore } from '../features/trail-bar';
import { type Breakpoint, type LookoutApi, useNow } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import type { useAttentionUi } from './useAttentionUi';
import type { useLiveTrail } from './useLiveTrail';

/**
 * The trail bar under the map, wired to the app: segments and chips open their bubble, More (remembered in this
 * browser) opens the three lists: everything that needs you (the ranked queue, every trail, with snooze), the agents
 * at work and what's up next. On a phone the lists always show.
 */
export function AppTrailBar(props: {
  api: LookoutApi;
  nav: ReturnType<typeof useAppNavigation>;
  attn: ReturnType<typeof useAttentionUi>;
  trail: ReturnType<typeof useLiveTrail>;
  /** On a phone the lists always show; on a wide screen three chips fit beside the bar, else two. */
  bp: Breakpoint;
  /** The trail's brief while it waits for review, for Needs you before the ranked queue loads. */
  brief?: ReactNode;
}) {
  const { api, nav, attn, trail } = props;
  const [more, setMore] = useTrailBarMore();
  const now = useNow(5000);
  const sel = api.selection;
  const live = [...trail.live.values()];
  const working = live.filter((l) => l.tone === 'working' || (l.tone === 'needs' && l.session));
  const onTicket = (id: string) => nav.select({ kind: 'ticket', id });
  if (!api.snap) return null;
  return (
    <TrailBar
      segments={trail.segments}
      counts={trail.counts}
      needs={trail.items}
      keyOf={trail.keyOf}
      selected={sel?.kind === 'ticket' ? sel.id : undefined}
      more={more}
      fixed={props.bp === 'mobile'}
      chips={props.bp === 'wide' ? 3 : 2}
      onMore={setMore}
      onTicket={onTicket}
      onNeed={attn.open}
      lists={
        <>
          <Panel className="trail-list needs-list">
            <WaitingOnYou
              activity={api.activity}
              snaps={api.allSnaps}
              currentMapId={api.mapId}
              attention={attn.attention}
              handlers={attn.handlers}
              onOpenQuestion={(sessionId) => {
                const q = api.activity.pending.find((p) => p.sessionId === sessionId);
                if (q) nav.openQuestion(q.id);
              }}
              onOpenTicket={nav.openTicket}
              brief={props.brief}
            />
          </Panel>
          <AgentsAtWork working={working} now={now} onTicket={onTicket} onOpenChat={(id) => nav.openChat(id)} />
          <UpNextList live={live} now={now} onTicket={onTicket} />
        </>
      }
    />
  );
}

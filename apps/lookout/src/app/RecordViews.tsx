import type { ActivityState, TrailDone } from '@teamtrail/core';
import { DecisionsView } from '../features/decisions';
import { TrailGlance } from '../features/inspector';
import { ActivityPage, PlanPage } from '../features/pages';
import { PerformanceView } from '../features/performance';
import { type Breakpoint, type LookoutApi, useNow } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';
import type { useAttentionUi } from './useAttentionUi';

/** The pages that cover the map: Trail stats (from Records), and Plan, Activity and the Logbook (the bar of views). */
export function RecordViews({
  api,
  bp,
  nav,
  scoped,
  done,
  attn,
}: {
  api: LookoutApi;
  bp: Breakpoint;
  nav: ReturnType<typeof useAppNavigation>;
  /** This trail's sessions and feed. */
  scoped: ActivityState;
  done?: TrailDone;
  attn: ReturnType<typeof useAttentionUi>;
}) {
  const now = useNow(5000);
  const onTicket = (id: string) => api.mapId && nav.openTicket(api.mapId, id);
  if (nav.statsOpen) return <PerformanceView api={api} bp={bp} onClose={() => nav.setStatsOpen(false)} />;
  switch (nav.page) {
    case 'logbook':
      return (
        <DecisionsView api={api} bp={bp} focus={nav.logbookFocus} onClose={nav.toMap} onOpenTicket={nav.openTicket} />
      );
    case 'plan':
      return (
        <PlanPage
          api={api}
          snap={api.snap}
          activity={scoped}
          selection={api.selection}
          onSelect={nav.select}
          onAudit={() => nav.openDecisions()}
          glance={(o) =>
            api.snap && (
              <TrailGlance
                snap={api.snap}
                sessions={scoped.sessions}
                attention={attn.attention.view}
                done={done}
                now={now}
                onTicket={onTicket}
                onItem={attn.open}
                onSelect={nav.select}
                onDestination={o.onDestination}
              />
            )
          }
        />
      );
    case 'activity':
      return (
        <ActivityPage
          activity={scoped}
          allActivity={api.activity}
          snaps={api.allSnaps}
          snap={api.snap}
          leases={api.leases}
          done={done}
          chatSession={api.chatSession}
          onTicket={onTicket}
          onOpenChat={(id) => nav.openChat(id)}
          onAnswer={api.actions.answer}
        />
      );
    default:
      return null;
  }
}

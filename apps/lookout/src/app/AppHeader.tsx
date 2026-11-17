import type { AttentionItem } from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Header, NeedsButton, ViewTabs } from '../features/header';
import { useKnowledge } from '../features/knowledge';
import { slackNeeds, useSlackStatus } from '../features/slack';
import type { LookoutApi, useBriefing } from '../hooks';
import type { Runtime } from '../lib';
import { type View, VIEW_TABS } from './tabs';

/** The header, wired to the app's trail actions, views, dialogs and the Slack connection alert. */
export function AppHeader(props: {
  api: LookoutApi;
  rt: Runtime;
  /** The repo name, or the project switcher. */
  repo: ReactNode;
  brief: ReturnType<typeof useBriefing>;
  /** Focus mode (features/attention). */
  attention?: ReactNode;
  /** The view on screen (none while Settings covers it), and the tabs' choice; no tabs on a phone (its tab bar). */
  view?: View;
  onView: (view: View) => void;
  phone: boolean;
  /** What needs you on this trail, most urgent first ("N need you" opens the first), and on other trails. */
  needs: AttentionItem[];
  elsewhere: AttentionItem[];
  onNeed: (item: AttentionItem) => void;
  onStats: () => void;
  onNewTrail: () => void;
  onStartOver: () => void;
  onSettings: () => void;
  onSlack: () => void;
  onToggleTheme: (night: boolean) => void;
}) {
  const { api, rt, brief } = props;
  const { snap, actions } = api;
  const [slack] = useSlackStatus(15000);
  const knowledge = useKnowledge();
  const slackAlert = slack ? slackNeeds(slack) : undefined;
  return (
    <Header
      repo={props.repo}
      snaps={api.allSnaps}
      map={snap?.map}
      activity={api.activity}
      health={api.health}
      onNewTrail={props.onNewTrail}
      onStartOver={props.onStartOver}
      onArchive={actions.setArchived}
      trackerLabel={rt.adapter.label.toLowerCase()}
      onSelectMap={actions.selectMap}
      onToggleMode={() => snap && actions.setMode(snap.map.mode === 'plan-only' ? 'plan+execute' : 'plan-only')}
      onSettings={props.onSettings}
      onToggleTheme={props.onToggleTheme}
      attention={props.attention}
      views={!props.phone && <ViewTabs tabs={VIEW_TABS} value={props.view} onChange={props.onView} />}
      needs={
        <NeedsButton
          count={props.needs.length}
          elsewhere={props.elsewhere.length}
          top={props.needs[0]?.title}
          onOpen={() => {
            const top = props.needs[0] ?? props.elsewhere[0];
            if (top) props.onNeed(top);
          }}
        />
      }
      slackAlert={slackAlert}
      onSlack={props.onSlack}
      onStats={props.onStats}
      knowledge={knowledge.attention}
      knowledgeOpen={knowledge.open}
      onKnowledge={() => knowledge.setOpen(!knowledge.open)}
      briefingOpen={brief.shown}
      briefingStatus={brief.status}
      onBriefing={() => (brief.shown ? brief.dismiss() : brief.open())}
    />
  );
}

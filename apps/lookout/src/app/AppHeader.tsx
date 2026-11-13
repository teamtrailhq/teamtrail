import type { ReactNode } from 'react';
import { Header } from '../features/header';
import { useKnowledge } from '../features/knowledge';
import { slackNeeds, useSlackStatus } from '../features/slack';
import type { LookoutApi, useBriefing } from '../hooks';
import type { Runtime } from '../lib';

/** The header, wired to the app's trail actions, dialogs and the Slack connection alert. */
export function AppHeader(props: {
  api: LookoutApi;
  rt: Runtime;
  /** The repo name, or the project switcher. */
  repo: ReactNode;
  brief: ReturnType<typeof useBriefing>;
  /** Focus mode and the interrupting count (features/attention), in place of the plain waiting count. */
  attention?: ReactNode;
  decisionsOpen: boolean;
  onDecisions: () => void;
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
      slackAlert={slackAlert}
      onSlack={props.onSlack}
      decisions={api.decisions.length}
      decisionsOpen={props.decisionsOpen}
      onDecisions={props.onDecisions}
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

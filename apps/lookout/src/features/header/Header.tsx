import {
  type MapSnapshot,
  type MapDoc,
  type ActivityState,
  type TrackerHealth,
  trailUsage,
  trailUsageSources,
  USAGE_SOURCE,
} from '@teamtrail/core';
import type { ReactNode } from 'react';
import { Panel, ScoutMark, Label, Readout, Button } from '../../components/ui';
import { type BriefingStatus, useNow } from '../../hooks';
import { hms, tokens, usd } from '../../lib';
import { managedThemeFixed } from '../../lib/managedTheme';
import { summaryLine } from '../../lib/markdown';
import { PrSyncIndicator } from '../pr-sync';
import { ManagedMenu } from './ManagedMenu';
import { RecordsMenu } from './RecordsMenu';
import { RunAgentsButton } from './RunAgentsButton';
import { ThemeToggle } from './ThemeToggle';
import { TrackerChip } from './TrackerChip';
import { TrailSwitcher } from './TrailSwitcher';

export function Header(props: {
  /** The repo name, or the project switcher when there are several projects. */
  repo: ReactNode;
  snaps: Record<string, MapSnapshot>;
  map?: MapDoc;
  activity: ActivityState;
  health: TrackerHealth;
  trackerLabel: string;
  onSelectMap: (id: string) => void;
  onNewTrail: () => void;
  /** Archive the trail on screen and open New trail with its idea filled in. */
  onStartOver?: () => void;
  onArchive?: (archived: boolean) => void;
  onToggleMode: () => void;
  onSettings: () => void;
  onToggleTheme: (night: boolean) => void;
  /** Set when Slack needs the trail lead: the connection broke, or the owner waits to be confirmed. */
  slackAlert?: { label: string; why: string };
  onSlack: () => void;
  /** Focus mode (features/attention); replaces the plain waiting count when given. */
  attention?: ReactNode;
  /** "N need you", opening the most urgent. */
  needs?: ReactNode;
  onStats: () => void;
  /** Knowledge entries that need the trail lead (suggestions, flags, stale). */
  knowledge: number;
  knowledgeOpen: boolean;
  onKnowledge: () => void;
  briefingOpen: boolean;
  briefingStatus: BriefingStatus;
  onBriefing: () => void;
  /** Hands-off or Hands-on (features/hands-off ModeSwitch). */
  modeSwitch?: ReactNode;
  /** Hands-off: the home lists what needs you and the progress, so the header leaves out its counts and readouts. */
  handsOff?: boolean;
}) {
  const { map } = props;
  const now = useNow(1000);
  const waiting = props.activity.pending.length;
  const cur = map && props.snaps[map.id];
  const u = map && trailUsage(props.activity, map.id);
  // One line however long the destination is: its first sentence, markdown stripped. Plan → Destination has it all.
  const dest = map ? summaryLine(map.sections.destination) : '';
  return (
    <Panel as="header" className={props.handsOff ? 'header hands-off' : 'header'}>
      <div className="h-title">
        <div className="h-line1">
          {props.repo}
          <span className="sep">/</span>
          <TrailSwitcher {...props} />
        </div>
        <div className="h-dest" title={dest}>
          <Label size="sm">Destination</Label>
          {dest || '—'}
        </div>
      </div>
      <div className="h-right">
        {props.modeSwitch}
        <TrackerChip label={props.trackerLabel} health={props.health} now={now} />
        <PrSyncIndicator now={now} />
        {map && cur && (
          <span className="trail-meta">
            <Readout
              label="Trail T+"
              value={hms(now - map.createdAt)}
              title="Trail elapsed time, since it was charted"
            />
            {u && u.costUsd + u.inputTokens + u.outputTokens > 0 && (
              <Readout
                className="spend"
                label="Spent"
                value={`${usd(u.costUsd)} · ${tokens(u.inputTokens + u.outputTokens)} tok`}
                title={[
                  'Model spend and tokens for this trail, across every session',
                  ...trailUsageSources(props.activity, map.id).map((x) => USAGE_SOURCE[x].text),
                ].join('\n')}
              />
            )}
          </span>
        )}
        {props.attention}
        {props.needs}
        {!props.attention && !props.needs && waiting > 0 && (
          <span className="waiting-chip" title={`${waiting} waiting on you`}>
            <ScoutMark variant="alert" size={14} />
            <b>{waiting}</b>
            <span className="wl">&nbsp;waiting on you</span>
          </span>
        )}
        {props.slackAlert && (
          <Button size="sm" variant="urgent" onClick={props.onSlack} title={props.slackAlert.why}>
            {props.slackAlert.label}
          </Button>
        )}
        {map?.mode === 'plan-only' && (
          <Button
            variant="ghost"
            className="mode-chip"
            onClick={props.onToggleMode}
            data-tip="Plan only: agents research and decide, but no execute tickets run. Click to switch to Plan + execute."
          >
            Plan only
          </Button>
        )}
        {map && <RunAgentsButton mapId={map.id} />}
        <RecordsMenu
          onStats={props.onStats}
          knowledge={props.knowledge}
          onKnowledge={props.onKnowledge}
          briefingOpen={props.briefingOpen}
          briefingStatus={props.briefingStatus}
          onBriefing={props.onBriefing}
        />
        <Button
          variant="ghost"
          onClick={props.onSettings}
          data-tip="Tracker, verification, appearance and integrations"
        >
          Settings
        </Button>
        {/* Behind a server's own sign-in, its theme wins; the toggle stays when the server saves a theme picked here (lib/managedTheme.ts). */}
        {managedThemeFixed() ? null : <ThemeToggle onToggle={props.onToggleTheme} />}
        <ManagedMenu />
      </div>
    </Panel>
  );
}

import { type ActivityState, type MapSnapshot, trailUsage, trailUsageSources, USAGE_SOURCE } from '@teamtrail/core';
import { LabelLine, SectionHeader } from '../../components/ui';
import { isRunning, tokens, usd } from '../../lib';

/** Header of the agent lanes: how many are at work, and the trail's spend (every session's, on hover where from). */
export function SessionsHead({
  activity,
  snap,
  running,
  usage = true,
}: {
  activity: ActivityState;
  snap?: MapSnapshot;
  running: number;
  usage?: boolean;
}) {
  const u = trailUsage(activity, snap?.map.id);
  const sources = trailUsageSources(activity, snap?.map.id);
  // Running sessions plus claims without a session (teammates), the same rows the list below shows.
  const live = new Set(activity.sessions.filter(isRunning).map((s) => s.ticketId));
  const claims = snap?.tickets.filter((t) => t.state === 'open' && t.assignee && !live.has(t.id)).length ?? 0;
  return (
    <SectionHeader
      className="sessions-head"
      title={<LabelLine parts={['Agents', `${running + claims} at work`]} />}
      right={
        usage ? (
          <span
            className="usage"
            title={['Model usage for this trail, all sessions', ...sources.map((x) => USAGE_SOURCE[x].text)].join('\n')}
          >
            <span className="mono-label">Trail</span> {tokens(u.inputTokens + u.outputTokens)} tok · {usd(u.costUsd)}
          </span>
        ) : undefined
      }
    />
  );
}

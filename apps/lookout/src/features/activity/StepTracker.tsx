import { type ActivityState, type MapSnapshot, STEPS, type TrailDone } from '@teamtrail/core';
import { EmptyState, MetaLine } from '../../components/ui';
import { hostedAgents } from '../../lib/hostedAgents';
import { TrailDoneStep } from '../trail-done';
import { featured } from './featured';

const STATUS = { running: 'Working', done: 'Done', failed: 'Stopped' } as const;

/** The latest step an agent reported, in words ("claude-01 · work, step 3 of 5" / "Resolve #6" / the ticket),
 * with the step pipeline underneath; once the trail is done, that it is. */
export function StepTracker({
  activity,
  snap,
  done,
}: {
  activity: ActivityState;
  snap?: MapSnapshot;
  done?: TrailDone;
}) {
  if (done && done.kind !== 'not-done') return <TrailDoneStep done={done} />;
  const s = featured(activity);
  if (!s)
    return (
      <EmptyState
        title="No agent working yet"
        hint={
          hostedAgents()
            ? `Turn your agents on for this trail in ${hostedAgents()?.label}. Each step they report shows here.`
            : 'Run /scout resume in Claude Code or Codex. Each step an agent reports shows here.'
        }
      />
    );
  const t = s.ticketId ? snap?.tickets.find((x) => x.id === s.ticketId) : undefined;
  const steps = STEPS[s.mode];
  const status = s.waitingOn ? 'Waiting on you' : STATUS[s.status];
  return (
    <div className={`step-tracker ${s.waitingOn ? 'waiting' : ''}`}>
      <div className="st-meta">
        <MetaLine parts={[{ text: s.agent, strong: true }, `${s.mode}, step ${s.step} of ${s.total}`]} />
        <span className={`t-label st-status ${s.waitingOn ? 'urgent' : ''}`}>{status}</span>
      </div>
      <div className="st-big">
        {s.stepLabel}
        {t && <span className="st-key"> {t.key}</span>}
      </div>
      {t && <div className="st-ticket t-meta">{t.title}</div>}
      <ol className="pipeline">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < s.step || (n === s.step && s.status === 'done');
          let cls = '';
          if (done) cls = 'done';
          else if (n === s.step) cls = 'cur';
          return (
            <li key={label} className={cls}>
              <i />
              <span>
                {String(n).padStart(2, '0')} {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

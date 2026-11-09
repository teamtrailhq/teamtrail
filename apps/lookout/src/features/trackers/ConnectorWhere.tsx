import type { RemoteKind, TrackerSettings } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import type { TrackerChoice } from '../../lib';
import { connectedAs } from './githubText';
import { isRemote } from './labels';
import { connectedToLinear } from './linearText';

/**
 * Where a tracker card points. Active GitHub and Linear say who and where ("Connected to owner/name as login, using
 * your gh login"); another active tracker shows its location; a connected but inactive one shows its saved target.
 */
export function ConnectorWhere(props: {
  id: TrackerChoice;
  active: boolean;
  configured: boolean;
  location: string;
  s?: TrackerSettings | null;
}) {
  const { id, active, s } = props;
  const remote = isRemote(id);
  const who = active && s ? connectedLine(id, s) : undefined;
  if (who) return <MetaLine className="c-who" parts={[who]} />;
  if (active && (id === 'markdown' || remote)) return <div className="c-loc">{props.location}</div>;
  if (remote && props.configured && s) return <div className="c-loc">{savedTarget(id, s)}</div>;
  return null;
}

/** "Connected to owner/name as login, …" or "Connected to Engineering in Octo Inc as Ada Ops, …". */
function connectedLine(id: TrackerChoice, s: TrackerSettings) {
  if (id === 'github') return connectedAs(s.github);
  if (id === 'linear') return connectedToLinear(s.linear);
  return undefined;
}

/** What a connected but inactive remote tracker points at: the repo, or the Linear team and project. */
function savedTarget(id: RemoteKind, s: TrackerSettings) {
  if (id === 'github') return s.github.repo;
  return [s.linear.teamKey, s.linear.projectName].filter(Boolean).join(' · ');
}

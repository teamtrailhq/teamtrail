import type { RemoteKind, TrackerSettings } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import type { TrackerChoice } from '../../lib';
import { connectedAs } from './githubText';
import { isRemote } from './labels';

/**
 * Where a tracker card points. Active GitHub says who and where ("Connected to owner/name as login, using your gh
 * login"); another active tracker shows its location; a connected but inactive one shows its saved target.
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
  const who = id === 'github' && active && s ? connectedAs(s.github) : undefined;
  if (who) return <MetaLine className="c-who" parts={[who]} />;
  if (active && (id === 'markdown' || remote)) return <div className="c-loc">{props.location}</div>;
  if (remote && props.configured && s) return <div className="c-loc">{savedTarget(id, s)}</div>;
  return null;
}

/** What a connected but inactive remote tracker points at: the repo, or the Linear team and project. */
function savedTarget(id: RemoteKind, s: TrackerSettings) {
  if (id === 'github') return s.github.repo;
  return [s.linear.teamKey, s.linear.projectName].filter(Boolean).join(' · ');
}

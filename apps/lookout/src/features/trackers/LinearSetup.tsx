import type { TrackerSettings, TrackerTestResult } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { LinearIdentity } from './LinearIdentity';
import { LinearKeyEntry } from './LinearKeyEntry';
import { LinearProjectChoice } from './LinearProjectChoice';
import { LinearTeamChoice } from './LinearTeamChoice';
import { keyWorks, personOf, willUseLinear } from './linearText';
import { defaultTeam } from './teamOptions';
import { TestLine } from './TestLine';
import { trackerApi } from './trackerApi';
import { useLinearLookups } from './useLinearLookups';

/**
 * Connect Linear: says whose key it is and which team (and optional project) it will use, and connects only on
 * Connect. With a working key (LINEAR_API_KEY or saved) the teams are listed at once; otherwise paste a key first.
 */
export function LinearSetup(props: { s: TrackerSettings; onConnected: () => void }) {
  const ln = props.s.linear;
  const works = keyWorks(ln);
  const [paste, setPaste] = useState(!works);
  const [apiKey, setApiKey] = useState('');
  const [teamId, setTeamId] = useState(ln.teamId ?? '');
  const [projectId, setProjectId] = useState(ln.projectId ?? '');
  const [result, setResult] = useState<TrackerTestResult>();
  const [busy, setBusy] = useState(false);
  const { enabled, list, teams, projects, loading, retryTeams, retryProjects } = useLinearLookups({
    ln,
    paste,
    apiKey,
    teamId,
  });
  // `LINEAR_API_KEY` set and the Lookout restarted, or a key saved elsewhere: the picker takes over.
  useEffect(() => {
    if (works && !apiKey) setPaste(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [works]);
  // The saved team if the key still sees it, else the only team, else none and a prompt to pick.
  useEffect(() => {
    if (list?.kind === 'ok') setTeamId(defaultTeam(list.teams, ln.teamId) ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);
  const team = teams.find((t) => t.id === teamId);
  const project = projects?.kind === 'ok' ? projects.projects.find((p) => p.id === projectId) : undefined;
  const viewer = list?.kind === 'ok' ? list.viewer : ln.viewer;
  const source = paste ? null : ln.auth;
  const line = willUseLinear({ viewer, team: team?.name, project: project?.name, source });
  const connect = async () => {
    if (!team) return;
    setBusy(true);
    setResult(undefined);
    try {
      await trackerApi.connect({
        active: 'linear',
        linear: {
          ...{ teamId: team.id, teamKey: team.key, teamName: team.name },
          ...{ projectId: project?.id, projectName: project?.name },
          apiKey: paste ? apiKey.trim() : undefined,
        },
      });
      props.onConnected();
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      setBusy(false);
    }
  };
  const pickTeam = (id: string) => {
    setTeamId(id);
    setProjectId('');
  };
  return (
    <div className="card inset tracker-setup linear-setup">
      {paste && <LinearKeyEntry ln={ln} apiKey={apiKey} onKey={setApiKey} />}
      <LinearIdentity
        line={line}
        email={personOf(viewer)?.email}
        onUseAnother={paste ? undefined : () => setPaste(true)}
      />
      {enabled && <LinearTeamChoice list={list} value={teamId} onChange={pickTeam} onRetry={retryTeams} />}
      {team && (
        <LinearProjectChoice list={projects} value={projectId} onChange={setProjectId} onRetry={retryProjects} />
      )}
      <TestLine r={result} />
      <footer>
        <button
          type="button"
          className="btn primary"
          disabled={busy || loading || !team}
          onClick={() => void connect()}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </footer>
    </div>
  );
}

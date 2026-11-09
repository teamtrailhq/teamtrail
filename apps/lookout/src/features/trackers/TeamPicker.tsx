import type { LinearTeamOption } from '@teamtrail/core';
import { useMemo, useState } from 'react';
import { MetaLine } from '../../components/ui';
import { teamOptions } from './teamOptions';
import { TeamRow } from './TeamRow';

const LIMIT = 40;

/** Pick the Linear team whose issues hold this project's trails: a searchable list of the teams the key can access. */
export function TeamPicker(props: {
  teams: LinearTeamOption[];
  truncated: boolean;
  value: string;
  onChange: (teamId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const now = useMemo(() => Date.now(), []);
  const { shown, matches } = teamOptions({ teams: props.teams, query, limit: LIMIT });
  const more = matches > shown.length ? `${matches - shown.length} more: type to narrow` : '';
  const cut = props.truncated ? `The first ${props.teams.length} teams` : '';
  const pick = props.value ? '' : 'Pick the team your trails go in';
  return (
    <div className="repo-picker">
      <label className="field">
        Team
        <input
          value={query}
          placeholder="Search your teams by key or name"
          spellCheck={false}
          aria-label="Search teams"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <ul className="repo-list" aria-label="Teams">
        {shown.map((t) => (
          <TeamRow key={t.id} team={t} selected={t.id === props.value} now={now} onPick={() => props.onChange(t.id)} />
        ))}
      </ul>
      <MetaLine parts={[!matches && 'No team matches', pick, more, cut]} />
    </div>
  );
}

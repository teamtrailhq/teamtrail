import type { LinearTeamOption } from '@teamtrail/core';

/** What the team picker shows for a search: teams whose key or name match, most recently active first, at most `limit`. */
export function teamOptions(o: { teams: LinearTeamOption[]; query: string; limit: number }) {
  const q = o.query.trim().toLowerCase();
  const matches = q
    ? o.teams.filter((t) => t.key.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    : o.teams;
  return { shown: matches.slice(0, o.limit), matches: matches.length };
}

/** The team picked at first: the one saved for this project if the key still sees it, else the only team, else none. */
export function defaultTeam(teams: LinearTeamOption[], saved: string | undefined): string | undefined {
  if (saved && teams.some((t) => t.id === saved)) return saved;
  return teams.length === 1 ? teams[0].id : undefined;
}

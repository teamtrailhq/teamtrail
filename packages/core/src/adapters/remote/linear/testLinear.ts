import { describeError } from '../describeError';
import { HttpClient, linear, TrackerError, type HttpOptions } from '../http';
import type { TrackerTestResult } from '../types';
import { linearGql, type LinearGql } from './linearGql';

type Team = { id: string; key: string; name: string };
type Project = { id: string; name: string };

const CANT_READ = "This Linear key can't read that team. Pick one of the teams it can access, or use another key.";

/** The team and its projects, or a plain refusal when the key can't read it (Linear says "not found" or "invalid"). */
async function teamWithProjects(gql: LinearGql, teamId: string): Promise<(Team & { projects: Project[] }) | null> {
  try {
    const p = await gql<{ team: (Team & { projects: { nodes: Project[] } }) | null }>(
      `query Projects($id: String!) { team(id: $id) { id key name projects(first: 250) { nodes { id name } } } }`,
      { id: teamId },
    );
    return p.team && { ...p.team, projects: p.team.projects.nodes };
  } catch (err) {
    if (err instanceof TrackerError && (err.code === 'not_found' || err.code === 'invalid')) return null;
    throw err;
  }
}

/**
 * Settings "Test connection" and the check before connecting: the key's user and teams, plus the projects of
 * `teamId` when given. A `teamId` (and `projectId`) the key can't read fails with a plain error.
 */
export async function testLinear(
  o: { apiKey: string; teamId?: string; projectId?: string; apiUrl?: string } & HttpOptions,
): Promise<TrackerTestResult> {
  const http = new HttpClient(linear, { retries: 0, ...o });
  try {
    const gql = linearGql(http, o.apiKey.trim(), o.apiUrl);
    const d = await gql<{ viewer: { name: string }; organization: { name: string }; teams: { nodes: Team[] } }>(
      `query Test { viewer { name } organization { name } teams(first: 50) { nodes { id key name } } }`,
    );
    const teams = d.teams.nodes;
    const teamId = o.teamId ?? (teams.length === 1 ? teams[0].id : undefined);
    const team = teamId ? await teamWithProjects(gql, teamId) : undefined;
    if (team === null) return { ok: false, code: 'not_found', error: CANT_READ };
    if (team && o.projectId && !team.projects.some((p) => p.id === o.projectId))
      return { ok: false, code: 'not_found', error: `That project isn't in ${team.name}, or this key can't read it.` };
    const listed = team && !teams.some((t) => t.id === team.id) ? [...teams, team] : teams;
    return {
      ok: true,
      account: `${d.viewer.name} · ${d.organization.name}`,
      organization: d.organization.name,
      target: team ? `${team.key} · ${team.name}` : undefined,
      teams: listed.map(({ id, key, name }) => ({ id, key, name })),
      projects: team?.projects,
      rate: http.rate,
    };
  } catch (err) {
    return { ok: false, ...describeError(err, 'Linear') };
  }
}

import type { CredentialSource, LinearTeamOption, LinearViewer, TrackerSettings } from '@teamtrail/core';

type LinearSettings = TrackerSettings['linear'];
type Person = Extract<LinearViewer, { kind: 'user' }>;

/** Where a Linear key came from, as it reads inside a sentence. The key itself never reaches the page. */
const FROM: Partial<Record<CredentialSource, string>> = {
  LINEAR_API_KEY: 'LINEAR_API_KEY',
  stored: 'a saved key',
};

export const keyFrom = (source: CredentialSource) => FROM[source] ?? source;

/** The person behind a key, when Linear said who it is. */
export function personOf(viewer: LinearViewer | undefined): Person | undefined {
  return viewer?.kind === 'user' ? viewer : undefined;
}

/** A key was found and Linear accepted it, so the team picker can list teams. */
export const keyWorks = (ln: LinearSettings) => !!ln.auth && !!personOf(ln.viewer);

/** "Engineering", or "Engineering / Mobile" with a project. */
function where(team: string | undefined, project: string | undefined): string | undefined {
  if (!team) return undefined;
  return project ? `${team} / ${project}` : team;
}

/** Before connecting: "Will use Engineering in Octo Inc as Ada Ops (LINEAR_API_KEY)". */
export function willUseLinear(o: {
  viewer?: LinearViewer;
  team?: string;
  project?: string;
  source?: CredentialSource | null;
}): string | undefined {
  const person = personOf(o.viewer);
  if (!person) return undefined;
  const target = where(o.team, o.project) ?? 'the team you pick';
  const how = o.source ? ` (${keyFrom(o.source)})` : '';
  return `Will use ${target} in ${person.orgName} as ${person.name}${how}`;
}

/** Once connected: "Connected to Engineering in Octo Inc as Ada Ops, using LINEAR_API_KEY". */
export function connectedToLinear(ln: LinearSettings): string | undefined {
  const target = where(ln.teamName ?? ln.teamKey, ln.projectName);
  if (!ln.teamId || !target) return undefined;
  const person = personOf(ln.viewer);
  const org = ln.orgName ?? person?.orgName;
  const inOrg = org ? ` in ${org}` : '';
  const who = person ? ` as ${person.name}` : '';
  const how = ln.auth ? `, using ${keyFrom(ln.auth)}` : '';
  return `Connected to ${target}${inOrg}${who}${how}`;
}

/** "Active today", "Active 4d ago", "Active 3mo ago", or "No issues yet". */
export function activeLabel(t: LinearTeamOption, now: number): string {
  if (!t.activeAt) return 'No issues yet';
  const days = Math.floor((now - Date.parse(t.activeAt)) / 86_400_000);
  if (days < 1) return 'Active today';
  if (days < 60) return `Active ${days}d ago`;
  return `Active ${Math.floor(days / 30)}mo ago`;
}

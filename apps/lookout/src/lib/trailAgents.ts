import { managedSignIn } from './managedSignIn';

/** This person's agents on one trail, as the server says (managedSignIn.ts `trailAgents`). */
export interface TrailAgents {
  canRun: boolean;
  repos: string[];
  on: boolean;
  repo?: string;
  running: number;
  /** Why none is going while they're on, in words. */
  note?: string;
}

const asState = (b: unknown): TrailAgents | undefined => {
  const v = b as Partial<TrailAgents>;
  if (typeof v?.on !== 'boolean' || !Array.isArray(v.repos)) return undefined;
  return {
    canRun: v.canRun === true,
    repos: v.repos.filter((r): r is string => typeof r === 'string').slice(0, 200),
    on: v.on,
    ...(typeof v.repo === 'string' ? { repo: v.repo } : {}),
    running: Number.isInteger(v.running) ? (v.running as number) : 0,
    ...(typeof v.note === 'string' ? { note: v.note.slice(0, 200) } : {}),
  };
};

/** Where to ask, or undefined behind a server that doesn't run agents. */
export const trailAgentsPath = () => managedSignIn()?.trailAgents;

export async function readTrailAgents(mapId: string) {
  const path = trailAgentsPath();
  if (!path) return undefined;
  const r = await fetch(`${path}?trail=${encodeURIComponent(mapId)}`).catch(() => undefined);
  return r?.ok ? asState(await r.json().catch(() => undefined)) : undefined;
}

/** Starts (`on`, in `repo` when there are several) or pauses them; the new state, or why not. */
export async function setTrailAgents(
  mapId: string,
  o: { on: boolean; repo?: string },
): Promise<TrailAgents | { error: string }> {
  const path = trailAgentsPath();
  if (!path) return { error: "This Lookout doesn't run agents." };
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trail: mapId, ...o }),
  }).catch(() => undefined);
  const body = (await r?.json().catch(() => undefined)) as { error?: unknown } | undefined;
  const state = r?.ok ? asState(body) : undefined;
  return state ?? { error: typeof body?.error === 'string' ? body.error.slice(0, 200) : "The server didn't answer." };
}

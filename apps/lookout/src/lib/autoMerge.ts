import { managedSignIn } from './managedSignIn';

/** What the server merged by itself since a time, as Hands-off's footer says it. */
export interface AutoMergeSummary {
  on: boolean;
  merged: number;
  /** The server's auto-merge setting, on this origin only. */
  settings?: string;
}

/** A path (with a fragment) on this origin, as the server's places are; anything else is dropped. */
function sameOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return undefined;
  try {
    return new URL(value, location.href).origin === location.origin ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Behind a server that merges verified pull requests itself (managedSignIn.ts `autoMerge`): how many it merged on a
 * trail since `since` (`GET <autoMerge>?since=<ms>&trail=<id>`). Undefined without one, or when it doesn't answer.
 */
export async function loadAutoMerge(trail: string, since: number): Promise<AutoMergeSummary | undefined> {
  const path = managedSignIn()?.autoMerge;
  if (!path) return undefined;
  const q = new URLSearchParams({ since: String(since), trail });
  const r = await fetch(`${path}?${q}`).catch(() => undefined);
  if (!r?.ok) return undefined;
  const b = (await r.json().catch(() => ({}))) as { on?: unknown; merged?: unknown; settings?: unknown };
  const merged = typeof b.merged === 'number' && b.merged >= 0 ? Math.floor(b.merged) : 0;
  return { on: b.on === true, merged, settings: sameOrigin(b.settings) };
}

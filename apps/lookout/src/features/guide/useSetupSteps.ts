import { useEffect, useState } from 'react';
import { managedSignIn } from '../../lib/managedSignIn';
import { onStreamOpen, onTrackerChange } from '../../lib/trackerChanges';
import { TRAIL_AGENTS_CHANGED } from '../../lib/trailAgents';

export interface SetupStep {
  title: string;
  href: string;
  done: boolean;
  next: boolean;
  optional: boolean;
}

export interface SetupView {
  done: number;
  total: number;
  complete: boolean;
  steps: SetupStep[];
}

/** A link on this origin only: a path, never another site or a script. */
const ownPath = (v: unknown) => (typeof v === 'string' && /^\/(?!\/)[\w/?=&#.-]{0,200}$/.test(v) ? v : undefined);

/** The server's answer, kept to its shape; undefined when it isn't one. */
function viewOf(body: unknown): SetupView | undefined {
  const b = body as { done?: unknown; total?: unknown; complete?: unknown; steps?: unknown };
  if (!Number.isInteger(b?.done) || !Number.isInteger(b?.total) || !Array.isArray(b?.steps)) return undefined;
  const steps = b.steps.slice(0, 10).flatMap((s: Record<string, unknown>) => {
    const href = ownPath(s?.href);
    if (typeof s?.title !== 'string' || !href) return [];
    return [
      {
        title: s.title.slice(0, 80),
        href,
        done: s.done === true,
        next: s.next === true,
        optional: s.optional === true,
      },
    ];
  });
  return { done: b.done as number, total: b.total as number, complete: b.complete === true, steps };
}

/**
 * How far this person is with setting up, from the server that hosts this Lookout (managedSignIn.ts `setup`): read
 * when the page opens, whenever it comes back into view (most steps are done on the server's pages), and when a trail
 * changes or its agents are switched here.
 */
export function useSetupSteps() {
  const path = managedSignIn()?.setup;
  const [view, setView] = useState<SetupView>();
  useEffect(() => {
    if (!path) return;
    let complete = false;
    const load = () =>
      void fetch(path)
        .then((r) => (r.ok ? r.json() : undefined))
        .then((b) => {
          const v = viewOf(b);
          complete = v?.complete === true;
          setView(v);
        })
        .catch(() => undefined);
    load();
    const onShow = () => document.visibilityState === 'visible' && load();
    // A trail created or its agents started here: read again, once a burst of file changes settles.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      // Once setup is complete, agents' file changes mean nothing to it.
      if (complete) return;
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener(TRAIL_AGENTS_CHANGED, soon);
    const offChange = onTrackerChange(soon);
    const offOpen = onStreamOpen(soon);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener(TRAIL_AGENTS_CHANGED, soon);
      offChange();
      offOpen();
    };
  }, [path]);
  return view;
}

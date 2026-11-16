import { useEffect, useState } from 'react';
import { managedSignIn } from '../../lib/managedSignIn';

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
 * when the page opens and again whenever it comes back into view, since the steps are done on the server's pages.
 */
export function useSetupSteps() {
  const path = managedSignIn()?.setup;
  const [view, setView] = useState<SetupView>();
  useEffect(() => {
    if (!path) return;
    const load = () =>
      void fetch(path)
        .then((r) => (r.ok ? r.json() : undefined))
        .then((b) => setView(viewOf(b)))
        .catch(() => undefined);
    load();
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [path]);
  return view;
}

import { PREFS_KEY, type ProjectsBriefing } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { projectsApi } from './projectsApi';

const SEEN_KEY = `${PREFS_KEY}:projects:seen`;
const DAY_MS = 24 * 3_600_000;

function lastSeen(now: number): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return v > 0 ? v : now - DAY_MS;
  } catch {
    return now - DAY_MS;
  }
}

function markSeen(at: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    // storage blocked: the next visit shows the last day instead
  }
}

/**
 * What changed in each project since All projects was last open (the last day the first time), built by the
 * server with the same briefing each Lookout shows. Leaving the overview marks it seen.
 */
export function useProjectsBriefing(): ProjectsBriefing | undefined {
  const [briefing, setBriefing] = useState<ProjectsBriefing>();
  useEffect(() => {
    const opened = Date.now();
    void projectsApi
      .briefing(lastSeen(opened))
      .then(setBriefing)
      .catch(() => {});
    return () => markSeen(opened);
  }, []);
  return briefing;
}

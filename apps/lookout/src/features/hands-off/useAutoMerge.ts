import { useEffect, useState } from 'react';
import { type AutoMergeSummary, loadAutoMerge } from '../../lib/autoMerge';

const startOfDay = (now: number) => new Date(new Date(now).toDateString()).getTime();

/** What the server merged by itself on the trail today (lib/autoMerge.ts), reloaded as tickets move. */
export function useAutoMerge(trail: string, version: number): AutoMergeSummary | undefined {
  const [summary, setSummary] = useState<AutoMergeSummary>();
  useEffect(() => {
    let live = true;
    void loadAutoMerge(trail, startOfDay(Date.now())).then((s) => live && setSummary(s));
    return () => {
      live = false;
    };
  }, [trail, version]);
  return summary;
}

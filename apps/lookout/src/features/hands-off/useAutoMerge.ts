import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { useNow } from '../../hooks/useNow';
import { type AutoMergeSummary, loadAutoMerge } from '../../lib/autoMerge';

const startOfDay = (now: number) => new Date(new Date(now).toDateString()).getTime();

/**
 * What the server merged by itself on the trail today (lib/autoMerge.ts), reloaded as tickets move and when the day
 * turns, so yesterday's merges stop counting at midnight.
 */
export function useAutoMerge(trail: string, version: number): AutoMergeSummary | undefined {
  const [summary, setSummary] = useState<{ trail: string; value?: AutoMergeSummary }>();
  const today = startOfDay(useNow(60_000));
  useLiveLoad({
    view: trail,
    version: `${version}|${today}`,
    load: () => loadAutoMerge(trail, today),
    show: (value) => setSummary({ trail, value }),
  });
  return summary?.trail === trail ? summary.value : undefined;
}

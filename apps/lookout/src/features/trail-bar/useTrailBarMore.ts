import { useState } from 'react';

const KEY = 'teamtrail.trail-bar.more';

function wasOpen() {
  try {
    return localStorage.getItem(KEY) === 'yes';
  } catch {
    return false;
  }
}

/** Whether the trail bar is extended (More) in this browser: a per-viewer convenience, minimal when unknown. */
export function useTrailBarMore() {
  const [more, setMore] = useState(wasOpen);
  const set = (open: boolean) => {
    setMore(open);
    try {
      localStorage.setItem(KEY, open ? 'yes' : 'no');
    } catch {
      // storage blocked: it opens minimal next time
    }
  };
  return [more, set] as const;
}

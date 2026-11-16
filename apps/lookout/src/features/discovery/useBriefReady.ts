import type { DiscoveryBrief } from '@teamtrail/core';
import { useState } from 'react';
import { briefReadySeen } from './briefReadySeen';

/** The "research is done" dialog: shown once per submitted brief in this browser, until it's closed or followed. */
export function useBriefReady(brief: DiscoveryBrief | null) {
  const [, setClosed] = useState(0);
  const show = brief?.status === 'submitted' && !briefReadySeen.has(brief);
  const close = () => {
    if (brief) briefReadySeen.add(brief);
    setClosed((n) => n + 1);
  };
  return { show, close };
}

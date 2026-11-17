import type { ScreenedCheck } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import type { RowFinding } from '../lib/rowFindings';
import { screenCheckRows } from '../lib/screenCheckRows';

/** How long typing pauses before the checks are read against the repo again. */
const PAUSE_MS = 400;

/**
 * Screens the checks being edited as the person types (a pause after the last change), each under its row's index:
 * what reading the repo says about whether its command can run, each with the command it was about. The latest
 * answer only; [] until one comes.
 */
export function useCheckScreening(checks: ScreenedCheck[]): RowFinding[] {
  const [findings, setFindings] = useState<RowFinding[]>([]);
  const key = JSON.stringify(checks);
  useEffect(() => {
    const stop = new AbortController();
    const timer = setTimeout(() => {
      const sent = JSON.parse(key) as ScreenedCheck[];
      void screenCheckRows(sent, stop.signal).then((found = []) => {
        const about = (check: string) => sent[Number(check)]?.run.join(' ') ?? '';
        if (!stop.signal.aborted) setFindings(found.map((f) => ({ ...f, command: about(f.check) })));
      });
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [key]);
  return findings;
}

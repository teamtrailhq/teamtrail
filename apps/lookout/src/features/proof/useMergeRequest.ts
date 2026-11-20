import { useState } from 'react';
import { postMerge, type MergeResult } from '../../lib/postMerge';

export type MergeState = { kind: 'idle' } | { kind: 'working' } | MergeResult;

/** One merge request's state: the request, then what happened. */
export function useMergeRequest(o: { path: string; mapId: string; ticketId: string }) {
  const [state, setState] = useState<MergeState>({ kind: 'idle' });
  const merge = async (gaps?: string[]) => {
    setState({ kind: 'working' });
    setState(await postMerge({ ...o, gaps }));
  };
  return { state, merge };
}

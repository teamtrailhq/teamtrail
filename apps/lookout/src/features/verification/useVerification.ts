import { useEffect, useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { prSync } from '../../lib';
import { type TicketVerification, verificationApi } from '../../lib/verification';

/**
 * A ticket's verification record, reloaded on every evidence change (SSE `verification`, `kind: 'evidence'`),
 * whenever `version` changes (the tracker saw the ticket move) and when the event stream opens.
 * Undefined while loading and without a local server.
 */
export function useVerification(mapId: string, ticketId: string, version: number) {
  const [data, setData] = useState<TicketVerification>();
  const view = `${mapId}/${ticketId}`;
  // another ticket shows nothing until its own record is in
  useEffect(() => setData(undefined), [view]);
  const { reload } = useLiveLoad({ view, version, load: () => verificationApi.ticket(mapId, ticketId), show: setData });
  useEffect(() => prSync.onEvidence(reload), [reload]);
  return { data, reload };
}

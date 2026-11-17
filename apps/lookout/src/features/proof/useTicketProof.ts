import type { Proof, ProofPostRecord } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

export interface TicketProofView {
  proof: Proof;
  /** Signed with this machine's key, ready for a pull request. */
  markdown: string;
  /** This machine's public key file, relative to the tracker folder, to commit. */
  keyFile?: string;
  /** What this machine last posted to the ticket's pull request. */
  post?: ProofPostRecord;
  /** `sha256:` of the proof's commit and gaps: what Merge anyway accepts (core's proof/gapsHash.ts). */
  gapsHash?: string;
  /** The trail lead's Merge anyway that accepted exactly these gaps, when there is one. */
  mergeAnyway?: { by: string; at: number };
}

/** A ticket's proof as the server builds it, fresh after verification and posting events. null without a server. */
export function useTicketProof(mapId: string, ticketId: string) {
  const [view, setView] = useState<TicketProofView | null>();
  useLiveLoad({
    load: async () => {
      const q = new URLSearchParams({ mapId, ticketId });
      const r = await fetch(`${apiBase()}/proof/ticket?${q}`);
      return r.ok ? ((await r.json()) as TicketProofView) : null;
    },
    show: setView,
    failed: () => setView(null),
    view: `${mapId}/${ticketId}`,
    changed: (p) => p.includes(`tickets/${ticketId}.md`),
    events: { verification: () => true, proof: () => true },
  });
  return view;
}

import type { MapSnapshot, SessionInfo, TicketLease, TrailDone } from '@teamtrail/core';
import type { Selection } from '../../lib';
import type { MapPreview } from './mapPreview';
import type { ProofStatuses } from './useTrailProofs';

/** What the map graph draws (MapGraph). */
export interface MapGraphProps {
  snap: MapSnapshot;
  sessions: SessionInfo[];
  leases?: TicketLease[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** Smallest zoom the initial fit may use; keeps text readable on phones. */
  minFit?: number;
  /** A pending reroute drawn over the map: ghost, struck and frozen tickets, dashed new edges. */
  preview?: MapPreview;
  /** Each done ticket's proof (useTrailProofs), for the cards' checks. */
  proofs?: ProofStatuses;
  /** Whether the trail is done (core's `trailDone`): the last stretches walked and a flag at the destination. */
  done?: TrailDone;
}

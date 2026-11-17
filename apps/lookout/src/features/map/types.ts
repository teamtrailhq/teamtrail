import type { MapSnapshot, TicketLease, TrailDone } from '@teamtrail/core';
import type { ReactNode } from 'react';
import type { Selection } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';
import type { MapPreview } from './mapPreview';
import type { ProofStatuses } from './useTrailProofs';

/** Checks on main at the start of the trail: needs your choice, held up, passing, running, or not run yet. */
export type MainTone = 'needs' | 'attention' | 'passed' | 'running' | 'neutral';

/** Where something on the map is on screen, relative to the map's box: a ticket's card or `main`. */
export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A ticket's anchor by its id, `main` for checks on main; undefined when it isn't on the map. */
export type AnchorOf = (id: string) => AnchorRect | undefined;

/** What the map graph draws (MapGraph). */
export interface MapGraphProps {
  snap: MapSnapshot;
  /** Where each ticket is right now: its agent, what needs you on it, what it waits on (lib/liveTickets.ts). */
  live: Map<string, LiveTicket>;
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
  /** Checks on main, drawn as `main` at the start of the trail; none while they're off. */
  main?: MainTone;
  /** Tickets that need you, most urgent first: the map opens on them (openingView.ts). */
  focus?: string[];
  /** Drawn over the map, beside what's selected: the bubble. */
  overlay?: (anchorOf: AnchorOf, box: { w: number; h: number }) => ReactNode;
}

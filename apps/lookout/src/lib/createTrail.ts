import {
  chartMap,
  DISCOVERY_TICKET,
  type Assumption,
  type TrackerAdapter,
  type VerificationLevel,
} from '@teamtrail/core';
import { apiBase } from './apiBase';

/**
 * The level a new trail starts at: the project's default from verification.json, only as approved on this machine
 * (as start_trail takes it, trustedChecks), and none when that is off or the server can't say.
 */
async function newTrailLevel(): Promise<VerificationLevel | undefined> {
  const view = await fetch(`${apiBase()}/verification/config`)
    .then((r) =>
      r.ok
        ? (r.json() as Promise<{ config?: { default?: VerificationLevel }; approval?: { state?: string } }>)
        : undefined,
    )
    .catch(() => undefined);
  const level = view?.approval?.state === 'approved' ? view.config?.default : undefined;
  return level && level !== 'off' ? level : undefined;
}

/**
 * A trail started from the Lookout: at the project's default verification level, as an agent's start_trail is, the map with its destination, notes and assumptions, plus the
 * discovery ticket and an empty brief. Any agent picks it up with `/scout resume`; Teamtrail still never starts one
 * locally.
 */
export async function createTrail(
  adapter: TrackerAdapter,
  input: { title: string; destination: string; notes: string; assumptions?: string[] },
) {
  const assumptions = (input.assumptions ?? []).map((text, i): Assumption => ({
    id: `S-${i + 1}`,
    text,
    status: 'holding',
    tickets: [],
  }));
  const verification = await newTrailLevel();
  const { map, tickets } = await chartMap(adapter, {
    title: input.title,
    ...(verification ? { verification } : {}),
    sections: {
      destination: input.destination,
      notes: input.notes,
      decisions: [],
      unspecified: [],
      outOfScope: [],
      ...(assumptions.length ? { assumptions } : {}),
    },
    tickets: [{ ref: 'discovery', ...DISCOVERY_TICKET }],
  });
  await fetch(`${apiBase()}/briefs/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: map.id, ticketId: tickets[0]?.id }),
  });
  return map;
}

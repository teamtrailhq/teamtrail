/** A trail's id as the evidence folders spell it (core's evidenceStore.ts), which `verification` events carry. */
const fileSafe = (id: string) => id.replace(/[^\w.-]/g, '_');

/**
 * Whether a `verification` server event concerns this trail: a ticket's evidence changed (an attempt, a verdict, a
 * waiver, a check run), with the trail's file-safe id, or PR sync brought one of its tickets' pull requests.
 */
export function verificationOfTrail(data: unknown, mapId: string): boolean {
  const e = data as { kind?: unknown; mapId?: unknown; tickets?: unknown } | undefined;
  if (e?.kind === 'evidence') return e.mapId === fileSafe(mapId);
  if (e?.kind !== 'sync' || !Array.isArray(e.tickets)) return false;
  return (e.tickets as { mapId?: unknown }[]).some((t) => t.mapId === mapId);
}
